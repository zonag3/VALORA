-- =========================================================
-- VALORA V9 — MIGRACIÓN DESDE V7/V8
-- EJECUTAR UNA SOLA VEZ EN:
-- Cloudflare > D1 > valora-db > Console
-- =========================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_name TEXT NOT NULL DEFAULT 'Valora',
  eyebrow TEXT NOT NULL DEFAULT 'ENCUESTA',
  title TEXT NOT NULL DEFAULT 'Nueva encuesta',
  intro_text TEXT NOT NULL DEFAULT 'Introduce el código que te han facilitado para comenzar.',
  access_button_text TEXT NOT NULL DEFAULT 'Entrar',
  single_use_text TEXT NOT NULL DEFAULT 'Cada código solo puede utilizarse una vez.',
  benefit1_title TEXT NOT NULL DEFAULT 'Privado',
  benefit1_text TEXT NOT NULL DEFAULT 'Tus respuestas se gestionan de forma confidencial.',
  benefit2_title TEXT NOT NULL DEFAULT 'Rápido',
  benefit2_text TEXT NOT NULL DEFAULT 'Completarla te llevará muy poco tiempo.',
  benefit3_title TEXT NOT NULL DEFAULT 'Tu opinión cuenta',
  benefit3_text TEXT NOT NULL DEFAULT 'Gracias por participar.',
  survey_eyebrow TEXT NOT NULL DEFAULT 'ENCUESTA',
  survey_title TEXT NOT NULL DEFAULT 'Responde las preguntas',
  survey_description TEXT NOT NULL DEFAULT 'Selecciona una respuesta para cada pregunta.',
  comment_label TEXT NOT NULL DEFAULT 'Comentario opcional',
  comment_placeholder TEXT NOT NULL DEFAULT 'Escribe aquí...',
  submit_button_text TEXT NOT NULL DEFAULT 'Enviar respuesta',
  thanks_eyebrow TEXT NOT NULL DEFAULT 'RESPUESTA REGISTRADA',
  thanks_title TEXT NOT NULL DEFAULT 'Gracias por participar',
  thanks_text TEXT NOT NULL DEFAULT 'Tu respuesta ha sido guardada correctamente.',
  hero_image_url TEXT NOT NULL DEFAULT 'assets/profesor.png',
  show_hero_image INTEGER NOT NULL DEFAULT 1 CHECK(show_hero_image IN (0,1)),
  allow_comments INTEGER NOT NULL DEFAULT 1 CHECK(allow_comments IN (0,1)),
  accent_color TEXT NOT NULL DEFAULT '#6f4fe8',
  header_color TEXT NOT NULL DEFAULT '#101d3b',
  max_attempts INTEGER NOT NULL DEFAULT 5,
  lock_minutes INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'scale'
    CHECK(question_type IN ('scale','yes_no','choice','text')),
  options_json TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS survey_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  first_access_at TEXT,
  last_access_at TEXT,
  used INTEGER NOT NULL DEFAULT 0 CHECK(used IN (0,1)),
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  survey_id INTEGER NOT NULL,
  survey_code_id INTEGER NOT NULL UNIQUE,
  comment TEXT,
  average REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (survey_code_id) REFERENCES survey_codes(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  numeric_value REAL,
  answer_text TEXT,
  UNIQUE(response_id, question_id),
  FOREIGN KEY (response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_survey_questions_survey
  ON survey_questions(survey_id, active, position);
CREATE INDEX IF NOT EXISTS idx_survey_codes_survey
  ON survey_codes(survey_id, used);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey
  ON survey_responses(survey_id, created_at);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question
  ON survey_answers(question_id);

-- Encuesta actual de V8.
INSERT OR IGNORE INTO surveys(
  id, brand_name, eyebrow, title, intro_text,
  access_button_text, single_use_text,
  benefit1_title, benefit1_text,
  benefit2_title, benefit2_text,
  benefit3_title, benefit3_text,
  survey_eyebrow, survey_title, survey_description,
  comment_label, comment_placeholder, submit_button_text,
  thanks_eyebrow, thanks_title, thanks_text,
  hero_image_url, show_hero_image, allow_comments,
  accent_color, header_color, max_attempts, lock_minutes, active
) VALUES (
  1,
  'Valora a tu profesor',
  'ENCUESTA DOCENTE',
  'Valora a tu profesor',
  'Introduce el código que te han facilitado para comenzar la encuesta.',
  'Entrar',
  'Cada código solo puede utilizarse una vez.',
  'Privado',
  'Tus respuestas se gestionan de forma confidencial.',
  'Rápido',
  'La encuesta te llevará menos de 2 minutos.',
  'Importa tu opinión',
  'Tus respuestas ayudan a mejorar la enseñanza.',
  'TU OPINIÓN CUENTA',
  'Valora la experiencia docente',
  'Selecciona una puntuación del 1 al 5 para cada afirmación.',
  'Comentario opcional',
  '¿Quieres añadir algo que ayude a mejorar?',
  'Enviar valoración',
  'RESPUESTA REGISTRADA',
  'Gracias por participar',
  'Tu valoración ha sido guardada correctamente y este código ya no puede volver a utilizarse.',
  'assets/profesor.png',
  1, 1,
  '#6f4fe8', '#101d3b',
  5, 10, 1
);

INSERT OR IGNORE INTO survey_questions
(id, survey_id, question_text, question_type, options_json, position, required, active)
VALUES
(1,1,'Explica los contenidos de forma clara','scale',NULL,1,1,1),
(2,1,'Motiva e interesa por la materia','scale',NULL,2,1,1),
(3,1,'Está disponible para resolver dudas','scale',NULL,3,1,1),
(4,1,'Trata a los alumnos con respeto','scale',NULL,4,1,1),
(5,1,'En general, ¿cómo valorarías a este profesor?','scale',NULL,5,1,1);

-- Migra los códigos actuales. Un código ya respondido queda VERDE.
INSERT OR IGNORE INTO survey_codes(
  survey_id, code, first_access_at, last_access_at, used, used_at, created_at
)
SELECT
  1,
  code,
  CASE WHEN used = 1 THEN COALESCE(used_at, created_at) ELSE NULL END,
  CASE WHEN used = 1 THEN COALESCE(used_at, created_at) ELSE NULL END,
  used,
  used_at,
  created_at
FROM codes;

-- Migra las respuestas anteriores.
INSERT OR IGNORE INTO survey_responses(
  id, survey_id, survey_code_id, comment, average, created_at
)
SELECT
  'legacy-' || v.id,
  1,
  sc.id,
  v.comment,
  v.average,
  v.created_at
FROM votes v
JOIN codes c ON c.id = v.code_id
JOIN survey_codes sc ON sc.code = c.code;

INSERT OR IGNORE INTO survey_answers(response_id, question_id, numeric_value, answer_text)
SELECT 'legacy-' || id, 1, q1, CAST(q1 AS TEXT) FROM votes
UNION ALL SELECT 'legacy-' || id, 2, q2, CAST(q2 AS TEXT) FROM votes
UNION ALL SELECT 'legacy-' || id, 3, q3, CAST(q3 AS TEXT) FROM votes
UNION ALL SELECT 'legacy-' || id, 4, q4, CAST(q4 AS TEXT) FROM votes
UNION ALL SELECT 'legacy-' || id, 5, q5, CAST(q5 AS TEXT) FROM votes;

-- =========================================================
-- V10 — SEGURIDAD, BLOQUEO DE CÓDIGOS Y CÓDIGO DEMO
-- =========================================================
CREATE TABLE IF NOT EXISTS security_attempts_v10 (
  client_key TEXT PRIMARY KEY,
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  permanent_blocked INTEGER NOT NULL DEFAULT 0 CHECK(permanent_blocked IN (0,1)),
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS code_controls (
  code_id INTEGER PRIMARY KEY,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)),
  protected INTEGER NOT NULL DEFAULT 0 CHECK(protected IN (0,1)),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (code_id) REFERENCES survey_codes(id) ON DELETE CASCADE
);

DELETE FROM survey_codes
WHERE code = '666-333' AND used = 0;

INSERT OR IGNORE INTO survey_codes(survey_id, code)
SELECT id, '333-666'
FROM surveys
WHERE active = 1
ORDER BY id DESC
LIMIT 1;

INSERT OR IGNORE INTO code_controls(code_id, blocked, protected, is_demo)
SELECT id, 0, 1, 1
FROM survey_codes
WHERE code = '333-666';

UPDATE code_controls
SET protected = 1, is_demo = 1, updated_at = CURRENT_TIMESTAMP
WHERE code_id = (SELECT id FROM survey_codes WHERE code='333-666' LIMIT 1);

