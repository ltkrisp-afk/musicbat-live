-- Existing recordings remain unclassified; no ownership or use grant is inferred.
ALTER TABLE tracks ADD COLUMN creation_classification TEXT CHECK(creation_classification IS NULL OR creation_classification IN ('Human','Human + AI','AI'));
