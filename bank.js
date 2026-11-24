'use strict';

const DIFFICULTIES = ['مستويات متنوعة', 'سهل', 'متوسط', 'صعب'];
const QUIZ_CATEGORIES = {
  'حول العالم': '◎',
  'علوم وطبيعة': '✳',
  'رياضة وتحدي': '◈',
  'لغتنا وألغاز': 'أ',
  'ديرتنا': '✦',
  'أرقام وذكاء': '#',
  'على الطاير': 'ϟ',
  'تاريخ وحضارات': '◷',
  'تقنية واختراعات': '⟐',
  'فنون وثقافة': '♫'
};

const BANK_CATEGORIES = {
  geography: 'حول العالم',
  history: 'تاريخ وحضارات',
  arabia: 'ديرتنا',
  science: 'علوم وطبيعة',
  nature: 'علوم وطبيعة',
  tech: 'تقنية واختراعات',
  language: 'لغتنا وألغاز',
  sports: 'رياضة وتحدي',
  puzzles: 'أرقام وذكاء',
  culture: 'فنون وثقافة',
  lightning: 'على الطاير',
  social: 'مين يقصد؟'
};

function questionKey(text) {
  return text.normalize('NFC').replace(/[ـ\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/[^\p{L}\p{N}]+/gu, '');
}

function legacyDifficulty(question) {
  const id = Number(question.id.slice(1));
  if (question.kind === 'social' || question.category === 'على الطاير') return 1;
  if (id <= 25) return 1;
  if (id <= 44) return 2;
  if (id <= 60) return 3;
  return id % 4 === 0 ? 2 : 1;
}

const quizBank = QUESTIONS.map(question => ({
  ...question,
  difficulty: legacyDifficulty(question)
}));
const quizKeys = new Set(quizBank.map(question => questionKey(question.question)));

for (const [bankId, bank] of Object.entries({
  world: globalThis.FAMILY_WORLD,
  science: globalThis.FAMILY_SCIENCE,
  culture: globalThis.FAMILY_CULTURE,
  extra: globalThis.FAMILY_EXTRA
})) {
  for (const [topic, rows] of Object.entries(bank)) {
    rows.forEach(([question, answer, difficulty], index) => {
      const key = questionKey(question);
      if (quizKeys.has(key)) return;
      quizKeys.add(key);
      quizBank.push({
        id: `${bankId}-${topic}-${index + 1}`,
        category: BANK_CATEGORIES[topic],
        kind: topic === 'social' ? 'social' : topic === 'lightning' ? 'challenge' : 'quiz',
        question,
        answer,
        difficulty
      });
    });
  }
}

const alphabet = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const letterBank = new Map(alphabet.map(letter => [
  letter,
  globalThis.FAMILY_LETTERS[letter].map(([question, answer, difficulty = 2], index) => ({
    id: `letter-${letter}-${index + 1}`, question, answer, difficulty, letter
  }))
]));
const questionIndex = new Map([
  ...quizBank,
  ...[...letterBank.values()].flat()
].map(question => [question.id, question]));
// q0131 repeats an older trivia question. Keep its ID available for saved sessions.
const playableQuizBank = quizBank.filter(question => question.id !== 'q0131');
const letterCount = [...letterBank.values()].reduce((total, questions) => total + questions.length, 0);
