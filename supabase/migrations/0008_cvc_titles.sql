-- Name the default lessons "CVC -an · Words" etc. (Short Story keeps its story title).
update lessons set title = 'CVC ' || family || ' · ' || (array['Words','Phrases','Sentences'])[level]
 where teacher_id is null and family is not null and level between 1 and 3;
