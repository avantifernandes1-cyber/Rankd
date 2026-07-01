/**
 * Ralli Content Service
 *
 * CRUD for tenant-scoped courses, lessons, quizzes, and lesson completions.
 * All functions return { data, error } — callers decide how to handle errors.
 *
 * Shape contracts:
 *   Lesson  → { id, title, description, type, duration, xp, status, videoUrl, notes }
 *   Course  → { id, title, description, lessonIds, emoji, color, status }
 *   Quiz    → { id, name, questions, status, is_favorite/favorite, tags, createdAt }
 *
 * DB ↔ App normalisation is handled here so callers receive consistent shapes.
 *
 * @module contentService
 */

import { supabase } from "./supabase.js";

// ─────────────────────────────────────────────────────────────────────────────
// LESSONS
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a DB row → app lesson shape */
function dbToLesson(row) {
  return {
    id:          row.id,
    title:       row.title,
    description: row.description ?? "",
    type:        row.type ?? "text",
    duration:    row.duration ?? "",
    xp:          row.xp ?? 100,
    status:      row.status ?? "active",
    videoUrl:    row.content?.videoUrl ?? "",
    notes:       row.content?.notes    ?? "",
    createdAt:   row.created_at,
  };
}

/** Normalise an app lesson → DB insert/update payload */
function lessonToDb(lesson, tenantId, userId) {
  return {
    tenant_id:   tenantId,
    title:       lesson.title,
    description: lesson.description ?? null,
    type:        lesson.type ?? "text",
    duration:    lesson.duration ?? null,
    xp:          lesson.xp ?? 100,
    status:      lesson.status ?? "active",
    content:     {
      videoUrl: lesson.videoUrl ?? null,
      notes:    lesson.notes    ?? null,
    },
    created_by:  userId ?? null,
    updated_at:  new Date().toISOString(),
  };
}

/**
 * Fetch all lessons for a tenant.
 * @param {string} tenantId
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getTenantLessons(tenantId) {
  const { data, error } = await supabase
    .from("tenant_lessons")
    .select("*")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  return { data: data ? data.map(dbToLesson) : null, error };
}

/**
 * Upsert a lesson (insert if no id, update if id present).
 * Returns the saved lesson in app shape.
 * @param {string} tenantId
 * @param {Object} lesson
 * @param {string} [userId]
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function upsertLesson(tenantId, lesson, userId) {
  const payload = lessonToDb(lesson, tenantId, userId);

  if (lesson.id && !lesson.id.startsWith("ll")) {
    // Existing DB row — update
    const { data, error } = await supabase
      .from("tenant_lessons")
      .update(payload)
      .eq("id", lesson.id)
      .select()
      .single();
    return { data: data ? dbToLesson(data) : null, error };
  } else {
    // New lesson — insert
    const { data, error } = await supabase
      .from("tenant_lessons")
      .insert(payload)
      .select()
      .single();
    return { data: data ? dbToLesson(data) : null, error };
  }
}

/**
 * Delete a lesson by id.
 * @param {string} lessonId
 * @returns {Promise<{ error: Object|null }>}
 */
export async function deleteLesson(lessonId) {
  const { error } = await supabase
    .from("tenant_lessons")
    .delete()
    .eq("id", lessonId);
  return { error };
}


// ─────────────────────────────────────────────────────────────────────────────
// COURSES
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a DB row → app course shape */
function dbToCourse(row) {
  return {
    id:          row.id,
    title:       row.title,
    description: row.description ?? "",
    lessonIds:   row.lesson_ids ?? [],
    emoji:       row.emoji ?? "📚",
    color:       row.color ?? "#FF6B35",
    status:      row.status ?? "active",
    createdAt:   row.created_at,
  };
}

/** Normalise an app course → DB payload */
function courseToDb(course, tenantId, userId) {
  return {
    tenant_id:   tenantId,
    title:       course.title,
    description: course.description ?? null,
    lesson_ids:  course.lessonIds ?? [],
    emoji:       course.emoji ?? null,
    color:       course.color ?? null,
    status:      course.status ?? "active",
    created_by:  userId ?? null,
    updated_at:  new Date().toISOString(),
  };
}

/**
 * Fetch all courses for a tenant.
 * @param {string} tenantId
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getTenantCourses(tenantId) {
  const { data, error } = await supabase
    .from("tenant_courses")
    .select("*")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  return { data: data ? data.map(dbToCourse) : null, error };
}

/**
 * Upsert a course.
 * @param {string} tenantId
 * @param {Object} course
 * @param {string} [userId]
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function upsertCourse(tenantId, course, userId) {
  const payload = courseToDb(course, tenantId, userId);

  if (course.id && !course.id.startsWith("lc")) {
    const { data, error } = await supabase
      .from("tenant_courses")
      .update(payload)
      .eq("id", course.id)
      .select()
      .single();
    return { data: data ? dbToCourse(data) : null, error };
  } else {
    const { data, error } = await supabase
      .from("tenant_courses")
      .insert(payload)
      .select()
      .single();
    return { data: data ? dbToCourse(data) : null, error };
  }
}

/**
 * Delete a course by id.
 * @param {string} courseId
 * @returns {Promise<{ error: Object|null }>}
 */
export async function deleteCourse(courseId) {
  const { error } = await supabase
    .from("tenant_courses")
    .delete()
    .eq("id", courseId);
  return { error };
}


// ─────────────────────────────────────────────────────────────────────────────
// QUIZZES
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a DB row → app quiz shape */
function dbToQuiz(row) {
  return {
    id:         row.id,
    name:       row.name,
    questions:  row.questions ?? [],
    status:     row.status ?? "active",
    favorite:   row.is_favorite ?? false,
    tags:       row.tags ?? [],
    createdAt:  row.created_at ? new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
  };
}

/** Normalise an app quiz → DB payload */
function quizToDb(quiz, tenantId, userId) {
  return {
    tenant_id:   tenantId,
    name:        quiz.name,
    questions:   quiz.questions ?? [],
    status:      quiz.status ?? "active",
    is_favorite: quiz.favorite ?? quiz.is_favorite ?? false,
    tags:        quiz.tags ?? [],
    created_by:  userId ?? null,
    updated_at:  new Date().toISOString(),
  };
}

/**
 * Fetch all quizzes for a tenant.
 * @param {string} tenantId
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getTenantQuizzes(tenantId) {
  const { data, error } = await supabase
    .from("tenant_quizzes")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  return { data: data ? data.map(dbToQuiz) : null, error };
}

/**
 * Upsert a quiz. Detects new vs existing by whether id looks like a legacy string.
 * @param {string} tenantId
 * @param {Object} quiz
 * @param {string} [userId]
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function upsertQuiz(tenantId, quiz, userId) {
  const payload = quizToDb(quiz, tenantId, userId);
  // Only treat as existing DB row if id is a real UUID returned from a prior insert.
  // Date.now() timestamps, "quiz_*", "sq_*", and any other non-UUID strings → INSERT.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isLegacyId = !quiz.id || !UUID_RE.test(quiz.id);

  if (!isLegacyId && quiz.id) {
    // UUID — update existing
    const { data, error } = await supabase
      .from("tenant_quizzes")
      .update(payload)
      .eq("id", quiz.id)
      .select()
      .single();
    return { data: data ? dbToQuiz(data) : null, error };
  } else {
    // New record — insert and return with DB-assigned UUID
    const { data, error } = await supabase
      .from("tenant_quizzes")
      .insert(payload)
      .select()
      .single();
    return { data: data ? dbToQuiz(data) : null, error };
  }
}

/**
 * Delete a quiz by id.
 * @param {string} quizId
 * @returns {Promise<{ error: Object|null }>}
 */
export async function deleteQuiz(quizId) {
  const { error } = await supabase
    .from("tenant_quizzes")
    .delete()
    .eq("id", quizId);
  return { error };
}


// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a DB row → app assignment shape */
function dbToAssignment(row) {
  return {
    id:          row.id,
    contentType: row.content_type,
    contentId:   row.content_id,
    assignedTo:  row.assigned_to ?? {},
    dueAt:       row.due_at ?? "Open",
    required:    row.required ?? false,
    assignedAt:  row.assigned_at
      ? new Date(row.assigned_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—",
  };
}

/**
 * Fetch all assignments for a tenant.
 * @param {string} tenantId
 * @returns {Promise<{ data: Object[]|null, error: Object|null }>}
 */
export async function getTenantAssignments(tenantId) {
  const { data, error } = await supabase
    .from("tenant_assignments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("assigned_at", { ascending: false });
  return { data: data ? data.map(dbToAssignment) : null, error };
}

/**
 * Create a new assignment.
 * @param {string} tenantId
 * @param {Object} assignment - { contentType, contentId, assignedTo, dueAt, required }
 * @param {string} [userId]
 * @returns {Promise<{ data: Object|null, error: Object|null }>}
 */
export async function createAssignment(tenantId, assignment, userId) {
  const { data, error } = await supabase
    .from("tenant_assignments")
    .insert({
      tenant_id:    tenantId,
      content_type: assignment.contentType,
      content_id:   assignment.contentId,
      assigned_to:  assignment.assignedTo ?? {},
      due_at:       assignment.dueAt && assignment.dueAt !== "Open" ? assignment.dueAt : null,
      required:     assignment.required ?? false,
      assigned_by:  userId ?? null,
    })
    .select()
    .single();
  return { data: data ? dbToAssignment(data) : null, error };
}

/**
 * Delete an assignment by id.
 * @param {string} assignmentId
 * @returns {Promise<{ error: Object|null }>}
 */
export async function deleteAssignment(assignmentId) {
  const { error } = await supabase
    .from("tenant_assignments")
    .delete()
    .eq("id", assignmentId);
  return { error };
}


// ─────────────────────────────────────────────────────────────────────────────
// LESSON COMPLETIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all lesson IDs the current user has completed.
 * Returns a Set of lesson ID strings.
 * @param {string} profileId
 * @returns {Promise<{ data: Set<string>|null, error: Object|null }>}
 */
export async function getLessonCompletions(profileId) {
  const { data, error } = await supabase
    .from("lesson_completions")
    .select("lesson_id")
    .eq("profile_id", profileId);
  return {
    data: data ? new Set(data.map(r => r.lesson_id)) : null,
    error,
  };
}

/**
 * Mark a lesson as complete for the current user.
 * Uses upsert — safe to call multiple times.
 * @param {string} profileId
 * @param {string} lessonId
 * @param {string} [tenantId]
 * @returns {Promise<{ error: Object|null }>}
 */
export async function markLessonComplete(profileId, lessonId, tenantId = null) {
  const { error } = await supabase
    .from("lesson_completions")
    .upsert(
      { profile_id: profileId, lesson_id: lessonId, tenant_id: tenantId },
      { onConflict: "profile_id,lesson_id" }
    );
  return { error };
}
