-- Draft names are unique per parent, ignoring case and edge spaces.
CREATE UNIQUE INDEX draft_subjects_name_key ON content.draft_subjects (lower(btrim(name)));
CREATE UNIQUE INDEX draft_topics_name_key ON content.draft_topics (subject_id, lower(btrim(name)));
CREATE UNIQUE INDEX draft_quizzes_name_key ON content.draft_quizzes (topic_id, lower(btrim(name)));
CREATE UNIQUE INDEX draft_decks_name_key ON content.draft_decks (topic_id, lower(btrim(name)));
