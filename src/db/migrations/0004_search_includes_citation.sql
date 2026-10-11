-- Section headings and file names often hold the topic word ("Osmosis",
-- "Unit 3 Photosynthesis") while the passage body doesn't repeat it, so the
-- search index now covers the citation as well as the passage text.

drop index if exists source_segments_search_idx;
alter table source_segments drop column if exists search;
alter table source_segments add column search tsvector
  generated always as (to_tsvector('english', citation || ' ' || text)) stored;
create index if not exists source_segments_search_idx on source_segments using gin(search);
