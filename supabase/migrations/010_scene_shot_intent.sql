-- Optional DoP camera-motion intent per storyboard segment (static, push_in, pull_back, etc.)
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS shot_intent text;

COMMENT ON COLUMN scenes.shot_intent IS
  'DoP camera motion intent: static, push_in, pull_back, orbit, follow, rise, descend';
