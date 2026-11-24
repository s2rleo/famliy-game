'use strict';

const $ = id => document.getElementById(id);
const QUIZ_KEY = 'jalsah-v2-session';
const LETTERS_KEY = 'jalsah-v3-letters';
const LETTER_LAYOUTS_KEY = 'jalsah-v3-letter-layouts';
const SEEN_KEY = 'jalsah-v2-seen';
const LETTER_SEEN_KEY = 'jalsah-v3-letters-seen';
const LINE_BONUS = 500;
const teamDefaults = ['الصقور', 'النمور'];
const selectedCategories = new Set(['ديرتنا', 'علوم وطبيعة', 'على الطاير']);
const screens = ['setup', 'play', 'letters-play', 'results'];
const numberFormat = new Intl.NumberFormat('ar-SA');
const n = value => numberFormat.format(value);

let mode = 'quiz';
let quiz = null;
let letters = null;
let result = null;
let quizInterval = null;
let lettersInterval = null;
let toastTimeout = null;
let lastOpenedLetter = null;
let answerVisibleToHost = false;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast('تعذّر الحفظ في المتصفح. تقدرون تكملون الجلسة الحين.');
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // The game still runs if the browser blocks storage.
  }
}

function toast(message) {
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

function show(screen) {
  for (const id of screens) $(id).hidden = id !== screen;
  window.scrollTo(0, 0);
}

function shuffle(values) {
  const shuffled = [...values];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function seenQuestions(key) {
  const seen = read(key, []);
  return new Set(Array.isArray(seen) ? seen : []);
}

function rememberQuestion(key, id, bankSize) {
  const seen = seenQuestions(key);
  if (seen.has(id)) seen.delete(id);
  seen.add(id);
  write(key, [...seen].slice(-bankSize));
}

function teamNames() {
  return teamDefaults.map((name, index) => $(`team${index + 1}`).value.trim() || name);
}

function durationSetting() {
  return Number($('duration').value);
}

function difficultySetting() {
  return Number($('difficulty').value);
}

function quizPool() {
  if (mode === 'social') return playableQuizBank.filter(question => question.kind === 'social');
  const difficulty = difficultySetting();
  return playableQuizBank.filter(question => question.kind !== 'social' &&
    selectedCategories.has(question.category) &&
    (!difficulty || question.difficulty === difficulty));
}

function availableLetters() {
  const difficulty = difficultySetting();
  return alphabet.map(letter => [
    letter,
    letterBank.get(letter).filter(question => !difficulty || question.difficulty === difficulty)
  ]).filter(([, questions]) => questions.length);
}

function renderSetup() {
  const inLetters = mode === 'letters';
  const inSocial = mode === 'social';
  for (const id of ['quiz', 'letters', 'social']) {
    const button = $(`${id}-mode`);
    button.classList.toggle('selected', mode === id);
    button.setAttribute('aria-pressed', String(mode === id));
  }
  $('quiz-setup').hidden = mode !== 'quiz';
  $('letters-setup').hidden = !inLetters;
  $('social-setup').hidden = !inSocial;
  $('team-fields').hidden = inSocial;
  $('difficulty-fields').hidden = inSocial;
  $('rounds-field').hidden = inLetters;
  $('board-size-field').hidden = !inLetters;
  $('settings-note').textContent = inSocial
    ? 'اقرؤوا الأسئلة على جهاز واحد وصوّتوا مع بعض.'
    : 'جهاز واحد يكفي. خلّوا أحدكم يمسك التحكيم.';
  $('start').textContent = inLetters ? 'ابدؤوا تحدّي الحروف' : 'يلا نبدأ الجلسة';

  if (mode === 'quiz') renderCategories();
  if (inLetters) {
    const available = availableLetters();
    const count = available.reduce((sum, [, questions]) => sum + questions.length, 0);
    const needed = Number($('board-size').value) ** 2;
    $('pool-count').textContent = `${n(count)} سؤال على ${n(available.length)} حرف`;
    $('start').disabled = available.length < needed;
    return;
  }

  const count = quizPool().length;
  const rounds = Number($('rounds').value);
  const unit = inSocial ? 'فقرة' : 'سؤال';
  $('pool-count').textContent = count
    ? `${n(count)} ${unit} متاح${inSocial ? 'ة' : ''}${count < rounds ? ` · الجولة ${n(count)}` : ''}`
    : 'اختاروا فئة أو غيّروا مستوى الصعوبة.';
  $('start').disabled = count === 0;
}

function renderCategories() {
  const grid = $('category-grid');
  const focused = document.activeElement?.dataset.category;
  const difficulty = difficultySetting();
  const counts = new Map();
  for (const question of playableQuizBank) {
    if (!difficulty || question.difficulty === difficulty) {
      counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
    }
  }
  grid.replaceChildren();
  for (const [category, mark] of Object.entries(QUIZ_CATEGORIES)) {
    const button = document.createElement('button');
    const active = selectedCategories.has(category);
    button.type = 'button';
    button.className = 'category';
    button.dataset.category = category;
    button.setAttribute('aria-pressed', String(active));

    const icon = document.createElement('span');
    icon.className = 'category-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = mark;
    const check = document.createElement('span');
    check.className = 'check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = active ? '✓' : '';
    const label = document.createElement('strong');
    label.textContent = category;
    const count = document.createElement('small');
    count.textContent = `${n(counts.get(category) ?? 0)} سؤال`;
    button.append(icon, check, label, count);
    button.onclick = () => {
      if (active) selectedCategories.delete(category);
      else selectedCategories.add(category);
      renderSetup();
    };
    grid.append(button);
    if (focused === category) button.focus();
  }
  $('select-all').textContent = selectedCategories.size === Object.keys(QUIZ_CATEGORIES).length
    ? 'إلغاء التحديد' : 'اختيار الكل';
}

function chooseMode(nextMode) {
  mode = nextMode;
  renderSetup();
}

function roundRobin(questions) {
  const buckets = new Map();
  for (const question of shuffle(questions)) {
    if (!buckets.has(question.category)) buckets.set(question.category, []);
    buckets.get(question.category).push(question);
  }
  const groups = [...buckets.values()];
  const deck = [];
  while (groups.some(group => group.length)) {
    for (const group of groups) {
      if (group.length) deck.push(group.pop());
    }
  }
  return deck;
}

function validTeams(teams) {
  return Array.isArray(teams) && teams.length === 2 && teams.every(team => typeof team === 'string');
}

function validQuiz(saved) {
  return saved && ['quiz', 'social'].includes(saved.mode) &&
    Array.isArray(saved.ids) && saved.ids.length > 0 &&
    saved.ids.every(id => questionIndex.has(id) && !questionIndex.get(id).letter) &&
    Number.isInteger(saved.index) && saved.index >= 0 && saved.index < saved.ids.length &&
    Array.isArray(saved.scores) && saved.scores.length === 2 && saved.scores.every(Number.isFinite) &&
    validTeams(saved.teams) && Array.isArray(saved.history) &&
    Number.isFinite(saved.duration) && saved.duration >= 0 && Number.isFinite(saved.remaining);
}

function validLetters(saved) {
  return saved && [4, 5].includes(saved.size) && validTeams(saved.teams) &&
    Array.isArray(saved.tiles) && saved.tiles.length === saved.size ** 2 &&
    saved.tiles.every(tile => questionIndex.get(tile?.id)?.letter === tile?.letter &&
      letterBank.has(tile?.letter) && [null, -1, 0, 1].includes(tile.owner)) &&
    [0, 1].includes(saved.turn) && Array.isArray(saved.history) &&
    Number.isFinite(saved.duration) && saved.duration >= 0 &&
    (saved.active === null || (
      Number.isInteger(saved.active?.index) && saved.tiles[saved.active.index] &&
      [0, 1].includes(saved.active.team) && [1, 2].includes(saved.active.attempt) &&
      Number.isFinite(saved.active.remaining)
    ));
}

function refreshResume() {
  const savedQuiz = read(QUIZ_KEY, null);
  $('resume-box').hidden = !validQuiz(savedQuiz);
  if (validQuiz(savedQuiz)) {
    $('resume-label').textContent = savedQuiz.mode === 'social' ? 'عندكم فقرة سوالف محفوظة' : 'عندكم تحدّي فرق محفوظ';
  }
  $('letters-resume-box').hidden = !validLetters(read(LETTERS_KEY, null));
}

function exitToSetup() {
  show('setup');
  refreshResume();
  renderSetup();
}

function scoreNodes(target, teams, scores, active = null) {
  target.replaceChildren();
  teams.forEach((team, index) => {
    const card = document.createElement('div');
    card.className = `score team-${index}`;
    if (active === index) card.classList.add('current-team');
    const name = document.createElement('span');
    name.textContent = team;
    const score = document.createElement('b');
    score.textContent = n(scores[index]);
    card.append(name, score);
    target.append(card);
  });
}

function startQuiz() {
  const available = quizPool();
  if (!available.length) return;
  const seen = seenQuestions(SEEN_KEY);
  const requested = Number($('rounds').value);
  const fresh = roundRobin(available.filter(question => !seen.has(question.id)));
  const previous = roundRobin(available.filter(question => seen.has(question.id)));
  const deck = [...fresh, ...previous].slice(0, requested);
  quiz = {
    ids: deck.map(question => question.id),
    index: 0,
    scores: [0, 0],
    teams: teamNames(),
    mode,
    duration: durationSetting(),
    remaining: durationSetting(),
    deadline: null,
    revealed: false,
    paused: false,
    history: []
  };
  if (deck.length < requested) toast(`الجلسة فيها ${n(deck.length)} ${mode === 'social' ? 'فقرة' : 'سؤال'} حسب الإعدادات.`);
  show('play');
  loadQuizQuestion();
}

function currentQuizQuestion() {
  return questionIndex.get(quiz.ids[quiz.index]);
}

function stopQuizClock() {
  clearInterval(quizInterval);
  quizInterval = null;
}

function clockText(duration, remaining) {
  return duration ? `${n(Math.max(0, Math.ceil(remaining)))} ث` : 'بدون مؤقت';
}

function remainingTime(deadline) {
  return Math.max(0, (deadline - Date.now()) / 1000);
}

function loadQuizQuestion() {
  stopQuizClock();
  quiz.remaining = quiz.duration;
  quiz.revealed = false;
  quiz.paused = false;
  quiz.deadline = quiz.duration ? Date.now() + quiz.duration * 1000 : null;
  rememberQuestion(SEEN_KEY, currentQuizQuestion().id, quizBank.length);
  write(QUIZ_KEY, quiz);
  renderQuiz();
  $('question').focus({ preventScroll: true });
  runQuizClock();
}

function renderQuiz() {
  const question = currentQuizQuestion();
  const social = quiz.mode === 'social';
  const progress = Math.round((quiz.index + 1) / quiz.ids.length * 100);
  $('q-category').textContent = social ? question.category : `${question.category} · ${DIFFICULTIES[question.difficulty]}`;
  $('question').textContent = question.question;
  $('answer-text').textContent = question.answer.split('|').join(' أو ');
  $('progress-label').textContent = `${social ? 'الفقرة' : 'السؤال'} ${n(quiz.index + 1)} من ${n(quiz.ids.length)}`;
  $('progress-fill').style.width = `${progress}%`;
  $('progress-fill').parentElement.setAttribute('aria-valuenow', String(progress));
  scoreNodes($('scores'), quiz.teams, quiz.scores);
  $('scores').hidden = social;
  $('answer').hidden = !quiz.revealed || social;
  $('reveal').hidden = quiz.revealed;
  $('reveal').textContent = social ? 'انتهى التصويت' : 'اكشفوا الإجابة';
  $('judging').hidden = !quiz.revealed;
  $('award1').textContent = `${quiz.teams[0]} +١٠`;
  $('award2').textContent = `${quiz.teams[1]} +١٠`;
  $('award-row').hidden = social;
  $('judge-label').textContent = social ? 'مين أخذ أكثر تصويت؟' : 'مين جاوب صح؟ الحكم يختار الفريق.';
  $('skip').textContent = social ? 'الفقرة التالية' : 'ما أحد جاوب';
  $('q-hint').textContent = social ? 'عدّوا إلى ثلاثة وصوّتوا مع بعض' : 'اقرؤوا السؤال بصوت عالٍ';
  $('pause-layer').hidden = !quiz.paused;
  $('quiz-controls').inert = quiz.paused;
  $('pause').textContent = quiz.paused ? 'استئناف' : 'إيقاف مؤقت';
  $('undo').disabled = quiz.history.length === 0 || quiz.paused;
  $('play-note').textContent = social ? 'سوالف وتصويت بدون نقاط' : 'الإجابة الصحيحة = ١٠ نقاط';
  $('timer').textContent = clockText(quiz.duration, quiz.remaining);
}

function runQuizClock() {
  stopQuizClock();
  if (quiz.paused || quiz.revealed || !quiz.deadline) return;
  const tick = () => {
    quiz.remaining = remainingTime(quiz.deadline);
    $('timer').textContent = clockText(quiz.duration, quiz.remaining);
    if (quiz.remaining === 0) revealQuiz();
  };
  tick();
  if (!quiz.revealed) quizInterval = setInterval(tick, 200);
}

function revealQuiz() {
  if (!quiz || quiz.revealed || quiz.paused) return;
  const focusAnswer = document.activeElement === $('reveal');
  stopQuizClock();
  quiz.revealed = true;
  quiz.deadline = null;
  write(QUIZ_KEY, quiz);
  renderQuiz();
  if (focusAnswer) $(quiz.mode === 'social' ? 'skip' : 'award1').focus({ preventScroll: true });
}

function freezeQuiz() {
  stopQuizClock();
  if (quiz.deadline) quiz.remaining = remainingTime(quiz.deadline);
  quiz.paused = true;
  quiz.deadline = null;
  write(QUIZ_KEY, quiz);
}

function toggleQuizPause() {
  if (!quiz) return;
  if (quiz.paused) {
    quiz.paused = false;
    quiz.deadline = quiz.duration && !quiz.revealed ? Date.now() + quiz.remaining * 1000 : null;
    write(QUIZ_KEY, quiz);
  } else {
    freezeQuiz();
  }
  renderQuiz();
  (quiz.paused ? $('continue') : $('question')).focus({ preventScroll: true });
  runQuizClock();
}

function advanceQuiz(team) {
  if (!quiz || !quiz.revealed || quiz.paused) return;
  quiz.history.push({ index: quiz.index, scores: [...quiz.scores] });
  if (team !== null && quiz.mode === 'quiz') quiz.scores[team] += 10;
  quiz.index++;
  if (quiz.index < quiz.ids.length) {
    loadQuizQuestion();
    return;
  }
  stopQuizClock();
  remove(QUIZ_KEY);
  showResult({ mode: quiz.mode, teams: quiz.teams, scores: quiz.scores, count: quiz.ids.length });
}

function undoQuiz() {
  if (!quiz || quiz.paused || !quiz.history.length) return;
  const previous = quiz.history.pop();
  quiz.index = previous.index;
  quiz.scores = previous.scores;
  loadQuizQuestion();
  toast('تم التراجع عن آخر نتيجة.');
}

function resumeQuiz() {
  const saved = read(QUIZ_KEY, null);
  if (!validQuiz(saved)) return refreshResume();
  quiz = saved;
  chooseMode(quiz.mode);
  freezeQuiz();
  show('play');
  renderQuiz();
  $('continue').focus();
}

function startLetters() {
  const size = Number($('board-size').value);
  const available = availableLetters();
  if (available.length < size ** 2) return;
  const layouts = read(LETTER_LAYOUTS_KEY, {});
  const saved = layouts[size] ? null : read(LETTERS_KEY, null);
  const previous = layouts[size] ?? (saved?.size === size && validLetters(saved) ? saved.tiles.map(tile => tile.letter) : null);
  const layout = shuffle(available).slice(0, size ** 2);
  if (Array.isArray(previous)) {
    for (const [index, [letter]] of layout.entries()) {
      if (letter !== previous[index]) continue;
      // Each letter appears only once, so swapping a match cannot create another one.
      const other = (index + 1 + Math.floor(Math.random() * (layout.length - 1))) % layout.length;
      [layout[index], layout[other]] = [layout[other], layout[index]];
    }
  }
  const seen = seenQuestions(LETTER_SEEN_KEY);
  const tiles = layout.map(([letter, questions]) => {
    const fresh = questions.filter(question => !seen.has(question.id));
    const question = shuffle(fresh.length ? fresh : questions)[0];
    return { letter, id: question.id, owner: null };
  });
  letters = {
    size,
    lineRules: 'hex',
    teams: teamNames(),
    duration: durationSetting(),
    turn: 0,
    tiles,
    active: null,
    history: []
  };
  lastOpenedLetter = null;
  write(LETTER_LAYOUTS_KEY, { ...layouts, [size]: tiles.map(tile => tile.letter) });
  write(LETTERS_KEY, letters);
  show('letters-play');
  renderBoard();
  $('board-title').focus({ preventScroll: true });
}

function boardLines(size, lineRules) {
  const positions = Array.from({ length: size }, (_, index) => index);
  const horizontalRows = positions.map(row => positions.map(column => row * size + column));
  if (lineRules !== 'hex') {
    // Saved games from the square board keep their original scores and lines.
    return [
      ...horizontalRows,
      ...positions.map(column => positions.map(row => row * size + column)),
      positions.map(index => index * size + index),
      positions.map(index => index * size + size - index - 1)
    ];
  }

  const lines = [...horizontalRows];
  for (const column of positions) {
    // Odd rows are offset by half a tile, so a straight slant moves one column every other row.
    for (const direction of [-1, 1]) {
      const columns = positions.map(row => column + Math.floor(direction * row / 2));
      if (columns.every(next => next >= 0 && next < size)) {
        lines.push(columns.map((next, row) => row * size + next));
      }
    }
  }
  return lines;
}

function letterScores() {
  const scores = [0, 0];
  const winners = new Set();
  for (const tile of letters.tiles) {
    if (tile.owner === 0 || tile.owner === 1) {
      scores[tile.owner] += questionIndex.get(tile.id).difficulty * 100;
    }
  }
  for (const line of boardLines(letters.size, letters.lineRules)) {
    const owner = letters.tiles[line[0]].owner;
    if ((owner === 0 || owner === 1) && line.every(index => letters.tiles[index].owner === owner)) {
      scores[owner] += LINE_BONUS;
      for (const index of line) winners.add(index);
    }
  }
  return { scores, winners };
}

function renderBoard() {
  const grid = $('letter-grid');
  const { scores, winners } = letterScores();
  const played = letters.tiles.filter(tile => tile.owner !== null).length;
  scoreNodes($('letters-scores'), letters.teams, scores, letters.turn);
  $('letters-progress').textContent = `${n(played)} من ${n(letters.tiles.length)} خانة`;
  $('board-turn').textContent = `الدور على ${letters.teams[letters.turn]}`;
  $('random-letter').disabled = played === letters.tiles.length || Boolean(letters.active);
  $('letters-undo').disabled = !letters.history.length || Boolean(letters.active);
  grid.style.setProperty('--board-size', letters.size);
  const rows = Array.from({ length: letters.size }, () => {
    const row = document.createElement('div');
    row.className = 'letter-row';
    return row;
  });
  grid.replaceChildren(...rows);
  letters.tiles.forEach((tile, index) => {
    const button = document.createElement('button');
    const letter = document.createElement('strong');
    const value = document.createElement('span');
    const points = questionIndex.get(tile.id).difficulty * 100;
    button.type = 'button';
    button.className = 'letter-tile';
    button.dataset.index = index;
    button.disabled = tile.owner !== null;
    letter.textContent = tile.letter === 'ا' ? 'أ' : tile.letter;
    value.textContent = tile.owner === -1 ? '—' : n(points);
    const ownership = tile.owner === -1 ? ' · تخطّيتوا الخانة'
      : tile.owner === null ? '' : ` · ${letters.teams[tile.owner]}`;
    button.setAttribute('aria-label', `حرف ${letter.textContent} · ${n(points)} نقطة${ownership}`);
    if (tile.owner === -1) button.classList.add('passed');
    if (tile.owner === 0 || tile.owner === 1) button.classList.add(`owned-${tile.owner}`);
    if (winners.has(index)) button.classList.add('in-line');
    button.append(letter, value);
    button.onclick = () => openLetter(index);
    rows[Math.floor(index / letters.size)].append(button);
  });
}

function openLetter(index) {
  if (!letters || letters.active || letters.tiles[index]?.owner !== null) return;
  letters.active = {
    index,
    team: letters.turn,
    attempt: 1,
    remaining: letters.duration,
    deadline: letters.duration ? Date.now() + letters.duration * 1000 : null,
    paused: false,
    judged: false
  };
  lastOpenedLetter = index;
  answerVisibleToHost = false;
  rememberQuestion(LETTER_SEEN_KEY, letters.tiles[index].id, letterCount);
  write(LETTERS_KEY, letters);
  showLetterDialog();
}

function showLetterDialog() {
  renderLetterQuestion();
  if (!$('letter-dialog').open) $('letter-dialog').showModal();
  const focus = letters.active.paused ? $('letter-continue')
    : letters.active.judged ? $('letter-next') : $('letter-question');
  focus.focus({ preventScroll: true });
  runLetterClock();
}

function renderLetterQuestion() {
  const active = letters.active;
  const tile = letters.tiles[active.index];
  const question = questionIndex.get(tile.id);
  const letter = tile.letter === 'ا' ? 'أ' : tile.letter;
  const team = letters.teams[active.team];
  const badge = $('letter-badge');
  badge.textContent = `حرف ${letter} · ${n(question.difficulty * 100)} نقطة`;
  badge.classList.toggle('owned-0', active.judged && tile.owner === 0);
  badge.classList.toggle('owned-1', active.judged && tile.owner === 1);
  $('letter-question').textContent = question.question;
  $('letter-attempt').textContent = active.judged
    ? tile.owner === -1 ? 'تخطّيتوا الخانة' : `الخانة لفريق ${letters.teams[tile.owner]}`
    : active.attempt === 1 ? `الدور على ${team}` : `فرصة للفريق الثاني · ${team}`;
  $('letter-answer').hidden = !active.judged && !answerVisibleToHost;
  $('letter-answer-text').textContent = question.answer.split('|').join(' أو ');
  $('letter-peek').textContent = answerVisibleToHost ? 'إخفاء الإجابة' : 'الإجابة للحكم';
  $('letter-peek').setAttribute('aria-expanded', String(answerVisibleToHost));
  $('letter-judging').hidden = active.judged;
  $('letter-next').hidden = !active.judged;
  $('letter-dialog-actions').hidden = active.judged;
  $('letter-expired').hidden = active.judged || !letters.duration || active.remaining > 0;
  $('letter-miss').textContent = active.attempt === 1 ? 'فرصة للفريق الثاني' : 'تخطّوا الخانة';
  $('letter-pause-layer').hidden = !active.paused;
  $('letter-controls').inert = active.paused;
  $('letter-timer').textContent = clockText(letters.duration, active.remaining);
}

function stopLetterClock() {
  clearInterval(lettersInterval);
  lettersInterval = null;
}

function runLetterClock() {
  stopLetterClock();
  const active = letters.active;
  if (!active || active.paused || active.judged || !active.deadline) return;
  const tick = () => {
    active.remaining = remainingTime(active.deadline);
    $('letter-timer').textContent = clockText(letters.duration, active.remaining);
    if (active.remaining === 0) {
      stopLetterClock();
      active.deadline = null;
      $('letter-expired').hidden = false;
      write(LETTERS_KEY, letters);
    }
  };
  tick();
  if (active.deadline) lettersInterval = setInterval(tick, 200);
}

function freezeLetters() {
  stopLetterClock();
  const active = letters.active;
  if (active && !active.judged) {
    if (active.deadline) active.remaining = remainingTime(active.deadline);
    answerVisibleToHost = false;
    active.paused = true;
    active.deadline = null;
  }
  write(LETTERS_KEY, letters);
}

function toggleLetterPause() {
  const active = letters?.active;
  if (!active || active.judged) return;
  if (active.paused) {
    active.paused = false;
    active.deadline = letters.duration && active.remaining > 0 ? Date.now() + active.remaining * 1000 : null;
    write(LETTERS_KEY, letters);
  } else {
    freezeLetters();
  }
  showLetterDialog();
}

function judgeLetter(correct) {
  const active = letters?.active;
  if (!active || active.judged || active.paused) return;
  stopLetterClock();
  if (!correct && active.attempt === 1) {
    answerVisibleToHost = false;
    active.attempt = 2;
    active.team = 1 - letters.turn;
    active.remaining = letters.duration;
    active.deadline = letters.duration ? Date.now() + letters.duration * 1000 : null;
    write(LETTERS_KEY, letters);
    showLetterDialog();
    return;
  }
  const tile = letters.tiles[active.index];
  const before = letterScores().scores;
  tile.owner = correct ? active.team : -1;
  letters.history.push({ index: active.index, turn: letters.turn });
  letters.turn = 1 - letters.turn;
  active.judged = true;
  active.deadline = null;
  write(LETTERS_KEY, letters);
  renderBoard();
  showLetterDialog();
  if (correct && letterScores().scores[active.team] - before[active.team] > questionIndex.get(tile.id).difficulty * 100) {
    toast(`خط كامل لفريق ${letters.teams[active.team]}!`);
  }
}

function closeLetterResult() {
  if (!letters?.active?.judged) return;
  $('letter-dialog').close();
  letters.active = null;
  const open = letters.tiles.some(tile => tile.owner === null);
  if (!open) {
    remove(LETTERS_KEY);
    showResult({ mode: 'letters', teams: letters.teams, scores: letterScores().scores, count: letters.tiles.length });
    return;
  }
  write(LETTERS_KEY, letters);
  renderBoard();
  const available = [...$('letter-grid').querySelectorAll('.letter-tile:not(:disabled)')];
  const next = available.find(button => Number(button.dataset.index) > lastOpenedLetter);
  (next ?? available[0])?.focus({ preventScroll: true });
}

function exitLetters() {
  if (!letters) return;
  freezeLetters();
  if ($('letter-dialog').open) $('letter-dialog').close();
  exitToSetup();
}

function resumeLetters() {
  const saved = read(LETTERS_KEY, null);
  if (!validLetters(saved)) return refreshResume();
  letters = saved;
  lastOpenedLetter = letters.active?.index ?? null;
  chooseMode('letters');
  freezeLetters();
  show('letters-play');
  renderBoard();
  if (letters.active) showLetterDialog();
  else $('board-title').focus({ preventScroll: true });
}

function undoLetter() {
  if (!letters || letters.active || !letters.history.length) return;
  const previous = letters.history.pop();
  letters.tiles[previous.index].owner = null;
  letters.turn = previous.turn;
  write(LETTERS_KEY, letters);
  renderBoard();
  $('letter-grid').querySelector(`[data-index="${previous.index}"]`)?.focus({ preventScroll: true });
  toast('رجعت آخر خانة للوحة.');
}

function randomLetter() {
  const choices = letters.tiles.flatMap((tile, index) => tile.owner === null ? [index] : []);
  if (choices.length) openLetter(shuffle(choices)[0]);
}

function showResult(finished) {
  result = finished;
  const [first, second] = finished.scores;
  const social = finished.mode === 'social';
  const tied = first === second;
  const winner = finished.teams[first > second ? 0 : 1];
  $('winner').textContent = social ? 'يا حلو جمعتكم!' : tied ? 'تعادل… الكل قدّها!' : `كفو يا ${winner}!`;
  const what = { social: 'فقرة تصويت', quiz: 'سؤال', letters: 'خانة حروف' }[finished.mode];
  $('result-sub').textContent = `خلصتوا ${n(finished.count)} ${what}.`;
  scoreNodes($('final-scores'), finished.teams, finished.scores);
  $('final-scores').hidden = social;
  $('share-status').textContent = '';
  show('results');
  $('winner').focus({ preventScroll: true });
}

async function shareResult() {
  if (!result) return;
  const label = result.mode === 'letters' ? 'تحدّي الحروف' : 'تحدّي الفرق';
  const message = result.mode === 'social'
    ? `خلصنا ${n(result.count)} فقرة في جلسة وفلة!`
    : `جلسة وفلة · ${label}\n${result.teams[0]} ${n(result.scores[0])} — ${result.teams[1]} ${n(result.scores[1])}`;
  try {
    await navigator.clipboard.writeText(message);
    $('share-status').textContent = 'تم نسخ النتيجة.';
  } catch {
    $('share-status').textContent = message;
  }
}

function info(title, text) {
  $('info-title').textContent = title;
  $('info-text').textContent = text;
  $('info').showModal();
}

for (const nextMode of ['quiz', 'letters', 'social']) {
  $(`${nextMode}-mode`).onclick = () => chooseMode(nextMode);
}
for (const control of ['difficulty', 'rounds', 'board-size']) $(control).onchange = renderSetup;
$('select-all').onclick = () => {
  if (selectedCategories.size === Object.keys(QUIZ_CATEGORIES).length) selectedCategories.clear();
  else for (const category of Object.keys(QUIZ_CATEGORIES)) selectedCategories.add(category);
  renderSetup();
};
$('start').onclick = () => mode === 'letters' ? startLetters() : startQuiz();
$('back').onclick = () => { freezeQuiz(); exitToSetup(); };
$('resume').onclick = resumeQuiz;
$('discard').onclick = () => { remove(QUIZ_KEY); refreshResume(); };
$('reveal').onclick = revealQuiz;
$('award1').onclick = () => advanceQuiz(0);
$('award2').onclick = () => advanceQuiz(1);
$('skip').onclick = () => advanceQuiz(null);
$('pause').onclick = toggleQuizPause;
$('continue').onclick = toggleQuizPause;
$('undo').onclick = undoQuiz;
$('letters-back').onclick = exitLetters;
$('letters-resume').onclick = resumeLetters;
$('letters-discard').onclick = () => { remove(LETTERS_KEY); refreshResume(); };
$('letters-undo').onclick = undoLetter;
$('random-letter').onclick = randomLetter;
$('letter-correct').onclick = () => judgeLetter(true);
$('letter-miss').onclick = () => judgeLetter(false);
$('letter-peek').onclick = () => {
  answerVisibleToHost = !answerVisibleToHost;
  renderLetterQuestion();
};
$('letter-next').onclick = closeLetterResult;
$('letter-save').onclick = exitLetters;
$('letter-pause-save').onclick = exitLetters;
$('letter-pause').onclick = toggleLetterPause;
$('letter-continue').onclick = toggleLetterPause;
$('letter-dialog').addEventListener('cancel', event => {
  event.preventDefault();
  if (letters.active?.judged) closeLetterResult();
  else exitLetters();
});
$('again').onclick = exitToSetup;
$('share').onclick = shareResult;
$('help').onclick = () => info('كيف نلعب؟', 'تحدّي الفرق\nاختاروا الفئات وخلّوا الحكم يقرأ السؤال. بعد كشف الإجابة، الفريق اللي جاوب صح يكسب ١٠ نقاط. في «على الطاير» يقبل الحكم أمثلة أخرى صحيحة.\n\nتحدّي الحروف\nاختاروا خلية وجاوبوا بكلمة تبدأ بحرفها. الإجابة الصحيحة تلوّن الخلية بلون الفريق. إذا أخطأ، ينتقل السؤال للفريق الثاني. الصف الأفقي الكامل أو الخط المائل من أول صف لآخر صف يعطي الفريق ٥٠٠ نقطة إضافية.\n\nسوالف وتصويت\nاقرؤوا السؤال وصوّتوا مع بعض بدون نقاط.');
$('privacy').onclick = () => info('خصوصيتكم', 'اللعبة ما تطلب حساب. أسماء الفرق، الجلسات المحفوظة، والأسئلة اللي ظهرت تبقى في متصفح هذا الجهاز. تقدرون تمسحونها من إعدادات المتصفح. يُحمّل الخط من Google Fonts عند الاتصال.');
$('close-dialog').onclick = () => $('info').close();
$('info').onclick = event => { if (event.target === $('info')) $('info').close(); };

function pauseVisibleGame() {
  if (quiz && !$('play').hidden) {
    freezeQuiz();
    renderQuiz();
  }
  if (letters && !$('letters-play').hidden && letters.active && !letters.active.judged) {
    freezeLetters();
    renderLetterQuestion();
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pauseVisibleGame(); });
window.addEventListener('pagehide', pauseVisibleGame);
$('total').textContent = n(playableQuizBank.length + letterCount);
renderSetup();
refreshResume();
if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
