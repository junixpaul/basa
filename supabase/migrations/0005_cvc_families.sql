-- Levels become CVC word families (Level 1 = -at, Level 2 = -an, ...). Inside each family a student
-- goes Words -> Phrases -> Sentences -> Short Story (students.level = that step, 1-4; 5 = all done).
-- Default lessons (teacher_id null) come from "CVC Family Reading Sequence" and are shared, read-only.

alter table lessons alter column teacher_id drop not null; -- null = built-in default lesson
alter table lessons add column family text, add column family_no int;
alter table students add column family_no int not null default 1;

-- everyone reads defaults; teachers still write only their own lessons
drop policy own on lessons;
create policy read on lessons for select using (teacher_id = auth.uid() or teacher_id is null);
create policy own_insert on lessons for insert with check (teacher_id = auth.uid());
create policy own_update on lessons for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy own_delete on lessons for delete using (teacher_id = auth.uid());

drop policy own on lesson_items;
create policy read on lesson_items for select
  using (exists (select 1 from lessons l where l.id = lesson_id and (l.teacher_id = auth.uid() or l.teacher_id is null)));
create policy own_write on lesson_items for all
  using (exists (select 1 from lessons l where l.id = lesson_id and l.teacher_id = auth.uid()))
  with check (exists (select 1 from lessons l where l.id = lesson_id and l.teacher_id = auth.uid()));

-- Move-up rule: passing the step the student is on (in their family) moves to the next step;
-- passing the Short Story moves to the next family's Words; after the last family, level 5 = finished.
drop function record_attempt(uuid, uuid, real, bool, jsonb, timestamptz);
create function record_attempt(p_student uuid, p_lesson uuid, p_score real, p_passed bool, p_result jsonb, p_at timestamptz default now())
returns jsonb language plpgsql security invoker as $$
declare st students; ls lessons; next_fam int;
begin
  -- security invoker: RLS hides other teachers' rows, so this rejects them
  select * into st from students where id = p_student;
  select * into ls from lessons where id = p_lesson;
  if st.id is null or ls.id is null then
    raise exception 'student or lesson not found' using errcode = 'insufficient_privilege';
  end if;
  insert into attempts (student_id, lesson_id, score, passed, result, created_at)
    values (p_student, p_lesson, p_score, p_passed, p_result, least(coalesce(p_at, now()), now()));
  if p_passed and st.level < 5 and ls.level = st.level and coalesce(ls.family_no, st.family_no) = st.family_no then
    if st.level < 4 then
      update students set level = level + 1 where id = p_student;
    else
      select min(family_no) into next_fam from lessons where family_no > st.family_no;
      if next_fam is null then update students set level = 5 where id = p_student;
      else update students set family_no = next_fam, level = 1 where id = p_student; end if;
    end if;
  end if;
  return (select jsonb_build_object('level', level, 'family_no', family_no) from students where id = p_student);
end $$;
grant execute on function record_attempt to authenticated;

-- Default lessons: one row per family x step, items one per word / phrase / sentence / story line.
do $$
declare
  data jsonb := '[["-at",["cat","hat","mat","rat","sat","bat"],["a fat cat","hat on the mat","a rat sat"],["The cat is fat.","A rat is on the mat.","The hat is on the bat."],"The Fat Cat",["The cat is fat.","A rat is on the mat.","I have a bat.","The fat cat sat.","The fat cat sat on the mat.","The hat is on the bat."]],["-an",["can","fan","man","pan","ran","van"],["a tan man","a fan in a van","ran to the pan"],["The man has a fan.","The van can run.","A man ran to the pan."],"The Man and the Fan",["A man has a fan.","The man sat by a van.","The fan is in the van.","A cat ran to the man.","The man can fan the cat."]],["-ap",["cap","map","nap","tap","lap","rap"],["a red cap","map on my lap","tap the cap"],["The cap is on my lap.","I can tap the map.","The cat can nap."],"The Cap and the Map",["I have a cap.","I have a map.","The map is on my lap.","The cat can nap by the map.","I tap my cap and get up."]],["-am",["ham","jam","ram","yam","Sam"],["ham and jam","Sam has jam","a ram by Sam"],["Sam has ham.","The ram ran to Sam.","I can have jam."],"Sam and the Ram",["Sam has ham and jam.","A ram ran to Sam.","Sam sat by the ram.","The ram can have a yam.","Sam and the ram are glad."]],["-ad",["bad","dad","mad","sad","pad","had"],["a sad dad","a bad pad","Dad had a cap"],["Dad had a bad hat.","The cat is sad.","I had a red pad."],"Dad and the Pad",["Dad had a pad.","The pad was bad.","Dad was sad.","Sam had a red pad.","Sam gave the pad to Dad.","Dad was glad."]],["-ag",["bag","rag","tag","wag","lag","sag"],["a big bag","tag on the bag","wag and wag"],["The rag is in the bag.","The dog can wag.","I see a tag on the bag."],"The Bag and the Rag",["A rag is in a bag.","The bag has a tag.","A dog can wag by the bag.","Dad can grab the rag.","The rag is not in the bag now."]],["-ab",["cab","dab","gab","jab","lab","tab"],["a red cab","a lab tab","dab the mat"],["The cab is red.","I can dab the rag.","Dad has a tab."],"The Red Cab",["A red cab is by the lab.","Dad can see the cab.","Sam has a tab.","The tab is in a bag.","Dad and Sam get in the cab."]],["-et",["get","jet","let","net","pet","wet"],["a wet pet","get the net","a red jet"],["The pet is wet.","Get the net.","Let the cat sit."],"The Wet Pet",["The pet is wet.","Ben can get a rag.","Let the pet sit on the mat.","Ben can get the pet dry.","The pet is glad."]],["-en",["den","hen","men","pen","ten"],["a red hen","ten men","hen in a pen"],["The hen is in a pen.","The men see the hen.","The hen ran to a den."],"The Hen and the Pen",["The hen is in a pen.","The men see the hen.","The hen ran to a den.","The men go to the den.","The hen is in the pen."]],["-ed",["bed","fed","led","red","wed"],["a red bed","fed the hen","red cap on the bed"],["The bed is red.","Ben fed the hen.","The cat is on the bed."],"The Red Bed",["Ben has a red bed.","The cat sat on the bed.","Ben fed the hen.","The hen ran to the bed.","Ben led the hen back to the pen."]],["-eg",["beg","leg","peg","Meg"],["a long leg","peg in the bag","Meg can beg"],["Meg has a peg.","The peg is by her leg.","The dog can beg."],"Meg and the Peg",["Meg has a red peg.","The peg is by her leg.","A dog can beg by Meg.","Meg can get the peg.","She puts the peg in a bag."]],["-em",["gem","hem"],["a red gem","hem on the cap","gem in a bag"],["The gem is red.","The gem is in the bag.","The hem is on the cap."],"The Red Gem",["Ben has a red gem.","The gem is in a bag.","Meg can see the gem.","Ben lets Meg hold it.","The gem goes back in the bag."]],["-it",["bit","fit","hit","kit","sit","pit"],["sit on the mat","a little kit","fit in the bag"],["The cat can sit.","The kit can fit in the bag.","Do not hit the pet."],"The Kit",["Tim has a kit.","The kit can fit in a bag.","Tim can sit on the mat.","The cat sits by Tim.","Tim puts the kit on his lap."]],["-in",["bin","fin","pin","tin","win"],["pin in the bin","a tin bin","win the game"],["The pin is in the bin.","The fish has a fin.","I can win."],"The Pin in the Bin",["A pin is in the bin.","Tim can see the pin.","He puts the pin in a tin.","The tin is in the bin.","Tim is glad he can find it."]],["-ig",["big","dig","fig","pig","wig"],["a big pig","dig a pit","a red wig"],["The pig is big.","The pig can dig.","The wig is on the bed."],"The Big Pig",["A big pig can dig.","The pig digs a pit.","A fig is by the pit.","The pig can see the fig.","The big pig sits by the fig."]],["-ip",["dip","hip","lip","rip","sip","tip"],["sip from a cup","dip the tip","rip the bag"],["I can sip.","Do not rip the map.","Dip the tip in red."],"A Sip and a Dip",["Kim has a cup.","She can sip from the cup.","She can dip the tip of a rag in it.","Do not let it drip on the mat.","Kim puts the cup on the table."]],["-id",["did","hid","kid","lid","rid"],["a red lid","kid hid it","lid on the bin"],["The kid hid the lid.","I did it.","The lid is on the bin."],"The Hidden Lid",["A kid had a red lid.","The kid hid the lid.","Dad did not see it.","The lid was by the bin.","The kid put the lid back."]],["-im",["dim","him","rim","Tim"],["a dim room","Tim and him","rim of the tin"],["Tim can see him.","The room is dim.","The rim is red."],"Tim in a Dim Room",["Tim is in a dim room.","He has a tin with a red rim.","A cat sits by him.","Tim can see the cat.","He and the cat sit on the mat."]],["-ix",["fix","mix","six"],["fix the box","mix it up","six red pins"],["Dad can fix it.","Mix the jam.","I see six pins."],"Fix the Box",["Dad has a box.","The box has a bad lid.","Dad can fix the lid.","Tim has six pins.","Dad puts the six pins in the box."]],["-ot",["cot","dot","hot","lot","not","pot","rot"],["a hot pot","dot on the pot","sit on the cot"],["The pot is hot.","The cat is on the cot.","Do not tap the hot pot."],"The Hot Pot",["Mom has a hot pot.","The pot is on a mat.","Tom can see the pot.","He does not tap the hot pot.","Tom sits on the cot and waits."]],["-op",["cop","hop","mop","pop","top"],["hop to the top","a wet mop","pop the top"],["The dog can hop.","The mop is wet.","Pop the top."],"Hop to the Top",["A dog can hop.","It hops by a mop.","The mop is wet.","The dog hops to the top of a mat.","Tom lets the dog sit."]],["-og",["bog","dog","fog","hog","jog","log"],["a big dog","log in the bog","jog in the fog"],["The dog is big.","The hog is by a log.","We can jog in the fog."],"The Dog and the Log",["A dog can jog.","The dog sees a log.","A hog is by the log.","Fog is on the bog.","The dog and hog sit by the log."]],["-ob",["cob","job","mob","rob","sob","Bob"],["Bob has a job","corn on a cob","Bob can sob"],["Bob has a job.","The cob is hot.","Do not rob Bob."],"Bob and the Cob",["Bob has a cob.","The cob is hot.","Bob lets it sit.","A dog comes to Bob.","Bob gives the dog a pat, not the cob."]],["-od",["cod","nod","pod","rod"],["a fishing rod","nod at Dad","cod in a pan"],["Dad has a rod.","I can nod.","The cod is in the pan."],"Dad and the Rod",["Dad has a rod.","Tom can hold the rod.","Dad gives a nod.","They get a cod.","The cod goes in a pan."]],["-ox",["box","fox","ox"],["a red box","fox by the box","an ox in a pen"],["The fox is by the box.","The box is red.","The ox is in a pen."],"The Fox and the Box",["A fox sees a box.","The box is by a log.","The fox sniffs the box.","An ox is in a pen.","The fox runs past the ox."]],["-ug",["bug","dug","hug","jug","mug","rug"],["bug on the rug","a red mug","hug the pup"],["The bug is on the rug.","I have a mug.","The dog dug a pit."],"The Bug on the Rug",["A bug is on the rug.","Gus can see the bug.","He has a mug and a jug.","The bug runs off the rug.","Gus is glad."]],["-un",["bun","fun","gun","nun","run","sun"],["run in the sun","a hot bun","fun run"],["The sun is hot.","I can run.","The bun is in the pan."],"Fun in the Sun",["The sun is up.","Gus can run.","A pup can run with Gus.","They have fun in the sun.","Gus has a bun when the run is done."]],["-ut",["but","cut","hut","nut","rut"],["a big hut","cut the bun","nut in a cup"],["The hut is big.","I can cut the bun.","The nut is in the cup."],"The Nut by the Hut",["A nut is by the hut.","A pup can see the nut.","The pup runs to the hut.","Gus gets the nut.","He puts it in a cup."]],["-up",["cup","pup"],["a little pup","cup on the mat","pup by the cup"],["The pup is up.","The cup is on the mat.","The pup can run."],"The Pup and the Cup",["A pup is up.","The pup sees a cup.","The cup is on the mat.","The pup sniffs the cup.","Gus puts the cup on a shelf."]],["-ub",["cub","rub","sub","tub"],["cub in a tub","rub the tub","a red sub"],["The cub is in the tub.","Rub the tub.","The sub is red."],"The Cub in the Tub",["A cub is in a tub.","The cub can rub the tub.","A pup sits by the tub.","The cub and pup have fun.","Gus lets them rest."]],["-um",["gum","hum","mum","sum"],["hum a song","gum in a bag","Mum can hum"],["Mum can hum.","The gum is in the bag.","I can do the sum."],"Mum Can Hum",["Mum can hum.","Gus can hum with Mum.","A pup sits on the rug.","Gus has gum in a bag.","Mum and Gus hum for fun."]],["-ud",["bud","mud"],["a red bud","mud on the rug","bud in the sun"],["The bud is red.","The pup is in the mud.","Do not get mud on the rug."],"The Pup in the Mud",["A pup runs in the mud.","Mud is on the pup.","Gus gets a tub.","He can rub the mud off the pup.","The pup sits on the rug when it is dry."]]]';
  f jsonb; n int := 0; step int; lid uuid; titles text[]; lists jsonb;
begin
  if exists (select 1 from lessons where teacher_id is null) then return; end if; -- seed once
  for f in select value from jsonb_array_elements(data) loop
    n := n + 1;
    titles := array[f->>0 || ' · Words', f->>0 || ' · Phrases', f->>0 || ' · Sentences', f->>4];
    lists := jsonb_build_array(f->1, f->2, f->3, f->5);
    for step in 1..4 loop
      insert into lessons (teacher_id, title, level, language, family, family_no)
        values (null, titles[step], step, 'en-US', f->>0, n) returning id into lid;
      insert into lesson_items (lesson_id, position, text)
        select lid, ord - 1, t from jsonb_array_elements_text(lists->(step - 1)) with ordinality as x(t, ord);
    end loop;
  end loop;
end $$;
