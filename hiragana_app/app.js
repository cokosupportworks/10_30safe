const getAppState = () => ({
  boardType, currentQuizMode, wrongAnswerCells, correctAnswerCell, quizConfig, playMode,
  currentTargetString, getNextTargetToken: typeof getNextTargetToken !== 'undefined' ? getNextTargetToken : () => null,
  quizInputTokens, quizHintActive, // ★ 追加
  isRecordMode, currentRecordTarget, recordedAudio, audioModePref,
  handleCellClick,
  isMinigameActive, minigameTargetCells, handleMinigameClick
});

const getVowel = (char) => {
  const vowelMap = {
    'あ': 'あ', 'か': 'あ', 'さ': 'あ', 'た': 'あ', 'な': 'あ', 'は': 'あ', 'ま': 'あ', 'や': 'あ', 'ら': 'あ', 'わ': 'あ', 'が': 'あ', 'ざ': 'あ', 'だ': 'あ', 'ば': 'あ', 'ぱ': 'あ', 'ぁ': 'あ', 'ゃ': 'あ',
    'い': 'い', 'き': 'い', 'し': 'い', 'ち': 'い', 'に': 'い', 'ひ': 'い', 'み': 'い', 'り': 'い', 'ぎ': 'い', 'じ': 'い', 'ぢ': 'い', 'び': 'い', 'ぴ': 'い', 'ぃ': 'い',
    'う': 'う', 'く': 'う', 'す': 'う', 'つ': 'う', 'ぬ': 'う', 'ふ': 'う', 'む': 'う', 'ゆ': 'う', 'る': 'う', 'ぐ': 'う', 'ず': 'う', 'づ': 'う', 'ぶ': 'う', 'ぷ': 'う', 'ぅ': 'う', 'ゅ': 'う',
    'え': 'え', 'け': 'え', 'せ': 'え', 'て': 'え', 'ね': 'え', 'へ': 'え', 'め': 'え', 'れ': 'え', 'げ': 'え', 'ぜ': 'え', 'で': 'え', 'べ': 'え', 'ぺ': 'え', 'ぇ': 'え',
    'お': 'お', 'こ': 'お', 'そ': 'お', 'と': 'お', 'の': 'お', 'ほ': 'お', 'も': 'お', 'よ': 'お', 'ろ': 'お', 'を': 'お', 'ご': 'お', 'ぞ': 'お', 'ど': 'お', 'ぼ': 'お', 'ぽ': 'お', 'ぉ': 'お', 'ょ': 'お',
    'ん': 'ん'
  };
  return vowelMap[char] || null;
};

let inputTokens = [];
let displayData = []; // ★追加: 画面表示・再生用の解析済みデータ
let boardType = "seion";
let playMode = "char";
let audioVolume = 0.7;
let seVolume = 0.7;

let isRecordMode = false;
let currentRecordTarget = null;
let countdownSetting = '3sec';
let isCountingDown = false;

const recordedAudio = new Set();
const audioModePref = new Map();

// ★ 問題モード用の状態管理
let currentQuizMode = null; // null, 1, 2, 3
let quizQuestions = [];     // 出題リスト
let currentQuizIndex = 0;   // 現在の問題番号
let quizRetryCount = 0;     // 現在のやり直し回数
let isQuizPlaying = false;  // クイズの音声再生中ロックフラグ
let currentTargetString = ""; // 現在の正解文字列
let currentTargetForcedReadings = {}; // ★ 追加: 現在の問題の強制ルビ情報
let wrongAnswerCells = new Set();
let correctAnswerCell = null;

let quizCorrectCount = 0;
let quizTotalCount = 0;
let totalQuizCorrectAnswers = 0; // ★ 追加: 累計の正解数
let earnedStamps = []; // ★ 追加: 獲得したスタンプの配列
let quizHintActive = false; // ★ 追加：クイズ開始後0.5秒間はヒントを非表示にするフラグ
let quizHintTimeout = null; // ★ 追加: ヒント遅延用のタイマーID

// ★ ミニゲーム用状態管理
let isMinigameActive = false;
let minigameScore = 0;
let minigameInterval = null;
let minigameTimeout = null;
let minigameTargetCells = [];
const handleMinigameClick = (cell) => {
  playSound('seion.wav');

  // スマホなどでも確実に音が鳴るように、ユーザー操作起因のここで音声を鳴らす
  // 読み上げ可能なすべてのセル（空白以外）からランダムに1つ選ぶ
  const allPlayableCells = [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells].filter(c => !c.char.includes(' '));
  if (allPlayableCells.length > 0) {
    const randomCell = allPlayableCells[Math.floor(Math.random() * allPlayableCells.length)];
    const fileName = window.HIRAGANA_DATA.fileNameMap[randomCell.char] || randomCell.char;
    const buffer = recordBuffers.get(randomCell.char) || sampleBuffers.get(`${fileName}.wav`);
    if (buffer) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      playAudioWithEffect(buffer, audioVolume);
    }
  }

  minigameScore++;
  minigameTargetCells = minigameTargetCells.filter(c => c.id !== cell.id);
  window.CANVAS_ENGINE.renderBoard(getAppState());

  const scoreBadge = document.getElementById('minigame-score-badge');
  if (scoreBadge) scoreBadge.textContent = minigameScore;
};

let quizInputTokens = [];
let quizDisplayData = []; // ★追加: クイズ用の解析済みデータ

let isSpeakingSequence = false;
let sequenceIndex = -1;

// ★ 変更: hint 設定の追加
let quizConfig = {
  showTabs: true,
  autoParticleConversion: false, // ★追加: デフォルトは「しない」
  q1: { type: 'seion-random', list: '', retry: 3, lock: true, hint: '1col' },
  q2: { type: 'random', list: '', retry: 3, lock: true, hint: '1col' },
  q3: { type: 'list-seq', list: '', retry: 3, hint: '1col' }
};

const DB_NAME = 'HiraganaAppDB';
const DB_VERSION = 1;
const STORE_NAME = 'recorded_assets';
let db = null;

let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sampleBuffers = new Map();
const recordBuffers = new Map();
const seBuffers = new Map();

// ==========================================
// ★追加: Kuromojiエンジンと辞書の準備
// ==========================================
const KUROMOJI_DB_NAME = 'KuromojiDictDB';
const KUROMOJI_STORE_NAME = 'dict_files';
const DICT_URL = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/";
const dictFiles = [
  'base.dat.gz', 'cc.dat.gz', 'check.dat.gz', 'tid.dat.gz', 'tid_map.dat.gz',
  'tid_pos.dat.gz', 'unk.dat.gz', 'unk_char.dat.gz', 'unk_compat.dat.gz',
  'unk_invoke.dat.gz', 'unk_map.dat.gz', 'unk_pos.dat.gz'
];

let kuromojiDb = null;
let tokenizer = null;

function initKuromojiDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KUROMOJI_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      kuromojiDb = e.target.result;
      if (!kuromojiDb.objectStoreNames.contains(KUROMOJI_STORE_NAME)) {
        kuromojiDb.createObjectStore(KUROMOJI_STORE_NAME, { keyPath: 'filename' });
      }
    };
    req.onsuccess = (e) => { kuromojiDb = e.target.result; resolve(); };
    req.onerror = (e) => reject(e);
  });
}

function checkDictStatus() {
  if (!kuromojiDb) return Promise.resolve(false);
  return new Promise((resolve) => {
    const tx = kuromojiDb.transaction(KUROMOJI_STORE_NAME, "readonly");
    const req = tx.objectStore(KUROMOJI_STORE_NAME).count();
    req.onsuccess = () => resolve(req.result === dictFiles.length);
    req.onerror = () => resolve(false);
  });
}

function createMockXHR(OriginalXHR) {
  function MockXHR() { this.original = new OriginalXHR(); this.isMock = false; this.mockFilename = ""; }
  MockXHR.prototype.open = function (method, url) {
    if (typeof url === 'string' && url.includes('mock-dict/')) { this.isMock = true; this.mockFilename = url.split('/').pop(); }
    else { this.original.open.apply(this.original, arguments); }
  };
  MockXHR.prototype.send = function () {
    if (this.isMock) {
      const req = kuromojiDb.transaction(KUROMOJI_STORE_NAME, "readonly").objectStore(KUROMOJI_STORE_NAME).get(this.mockFilename);
      req.onsuccess = (e) => {
        const record = e.target.result;
        if (record && record.data) { this.response = record.data; this.status = 200; this.statusText = "OK"; this.readyState = 4; if (this.onload) this.onload({ target: this }); }
        else { this.status = 404; this.statusText = "Not Found"; this.readyState = 4; if (this.onload) this.onload({ target: this }); }
      };
    } else {
      this.original.responseType = this.responseType;
      this.original.onload = (e) => { this.readyState = this.original.readyState; this.status = this.original.status; this.response = this.original.response; if (this.onload) this.onload(e); };
      this.original.send.apply(this.original, arguments);
    }
  };
  return MockXHR;
}

async function downloadDictFiles(statusTxtElement) {
  for (let i = 0; i < dictFiles.length; i++) {
    const file = dictFiles[i];
    if (statusTxtElement) statusTxtElement.textContent = `言語エンジンを準備しています... (${i + 1}/${dictFiles.length})`;

    // リトライ処理付きのfetch
    let res;
    let arrayBuffer;
    for (let retry = 0; retry < 3; retry++) {
      try {
        res = await fetch(DICT_URL + file);
        if (res.ok) { arrayBuffer = await res.arrayBuffer(); break; }
      } catch (e) { }
      if (retry < 2) await new Promise(r => setTimeout(r, 1000));
    }
    if (!res || !res.ok) throw new Error(`Fetch failed: ${file}`);

    await new Promise((resolve, reject) => {
      const tx = kuromojiDb.transaction(KUROMOJI_STORE_NAME, "readwrite");
      tx.objectStore(KUROMOJI_STORE_NAME).put({ filename: file, data: arrayBuffer });
      tx.oncomplete = () => resolve(); tx.onerror = (e) => reject(tx.error || e);
    });
  }
}

function bootEngine() {
  return new Promise((resolve, reject) => {
    const OriginalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = createMockXHR(OriginalXHR);
    kuromoji.builder({ dicPath: "mock-dict" }).build((err, _tokenizer) => {
      window.XMLHttpRequest = OriginalXHR;
      if (err) reject(err); else { tokenizer = _tokenizer; resolve(); }
    });
  });
}

// ==========================================
// ★追加: 文字と読みの解析・マージ処理
// ==========================================
function kataToHira(str) { return str.replace(/[\u30A1-\u30F6]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60)); }

// 誤読防止用のデータセット
const safeWords = {
  "はは": "母", "はな": "花", "はし": "橋", "はこ": "箱", "はる": "春", "はれ": "晴れ", "はと": "鳩", "はち": "蜂", "はた": "旗", "はり": "針",
  "はね": "羽", "はら": "原", "はま": "浜", "はか": "墓", "はげ": "禿", "はしご": "梯子", "はさみ": "鋏", "はなび": "花火", "はっぱ": "葉っぱ",
  "はこぶ": "運ぶ", "はたらく": "働く", "はしる": "走る", "はなす": "話す", "はらう": "払う", "はいる": "入る", "はれる": "晴れる", "はじまる": "始まる",
  "はかる": "測る", "はやく": "早く", "はやい": "早い", "はずかしい": "恥ずかしい", "はげしい": "激しい", "はみがき": "歯磨き", "はぶらし": "歯ブラシ",
  "はくぶつかん": "博物館", "はつめい": "発明", "はっけん": "発見", "はんぶん": "半分", "はんこ": "判子", "はんたい": "反対", "はんばーぐ": "ハンバーグ",
  "へや": "部屋", "へび": "蛇", "へそ": "臍", "へん": "変", "へり": "縁", "へい": "塀", "へいわ": "平和", "へんじ": "返事", "へた": "下手",
  "へんか": "変化", "へいし": "兵士", "へいたい": "兵隊", "へんてこ": "変てこ", "へりこぷたー": "ヘリコプター", "へんしん": "変身", "へんたい": "編隊",
  "へこむ": "凹む", "へる": "減る", "へらす": "減らす", "へいじつ": "平日",
  "このは": "木の葉", "のはら": "野原", "あきはばら": "秋葉原", "あさはやく": "朝早く", "ごほうび": "ご褒美", "たいへん": "大変", "はへん": "破片"
};
const specialGreetings = ["こんにちは", "こんばんは"];

// ★ 変更: 第2引数 extraForcedReadings を追加
function getReadingMap(rawText, extraForcedReadings = {}) {
  if (!rawText) return [];

  let forcedReadings = {};

  // 1. 特例ルール（こんにちは等の末尾の「は」を「わ」に）
  if (quizConfig.autoParticleConversion) {
    specialGreetings.forEach(greeting => {
      let startIndex = 0;
      while ((startIndex = rawText.indexOf(greeting, startIndex)) !== -1) {
        forcedReadings[startIndex + greeting.length - 1] = 'わ';
        startIndex += greeting.length;
      }
    });
  }

  // 2. 連続する「は」「へ」の強制ルール
  const haRegex = /は{2,}/g; let match;
  while ((match = haRegex.exec(rawText)) !== null) {
    for (let i = 0; i < match[0].length; i++) forcedReadings[match.index + i] = 'は';
  }
  const heRegex = /へ{2,}/g;
  while ((match = heRegex.exec(rawText)) !== null) {
    for (let i = 0; i < match[0].length; i++) forcedReadings[match.index + i] = 'へ';
  }

  // 3. よく使われる名詞＋「は」「へ」のルビ固定ルール
  if (quizConfig.autoParticleConversion) {
    // (safeWordsによる「はか」→「墓」などの誤結合を防ぐため、頻出名詞の後ろにある助詞を明示的に保護)
    const commonSubjects = [
      "ぼく", "わたし", "あなた", "きみ", "かれ", "かのじょ", "みんな", "だれ", "なに",
      "いぬ", "ねこ", "とり", "うし", "うま", "くま", "ぶた", "さかな", "むし", "ぞう", "らいおん", "きりん",
      "これ", "それ", "あれ", "どれ",
      "きょう", "あした", "あさって", "きのう", "おととい", "いま", "らいしゅう", "こんしゅう", "せんしゅう",
      "せんせい", "おかあさん", "おとうさん", "おにいさん", "おねえさん", "おとうと", "いもうと", "おじいさん", "おばあさん", "ともだち"
    ];
    commonSubjects.forEach(noun => {
      let startIndex = 0;
      while ((startIndex = rawText.indexOf(noun + "は", startIndex)) !== -1) {
        const idx = startIndex + noun.length;
        if (!forcedReadings[idx]) forcedReadings[idx] = 'わ';
        startIndex += 1;
      }
    });

    const commonDestinations = [
      "どこ", "ここ", "そこ", "あそこ", "わたし", "ぼく", "あなた",
      "いえ", "がっこう", "かいしゃ", "うみ", "やま", "えき", "こうえん", "そら", "まち", "そと", "なか", "みせ"
    ];
    commonDestinations.forEach(noun => {
      let startIndex = 0;
      while ((startIndex = rawText.indexOf(noun + "へ", startIndex)) !== -1) {
        const idx = startIndex + noun.length;
        if (!forcedReadings[idx]) forcedReadings[idx] = 'え';
        startIndex += 1;
      }
    });
  }

  // ★ 追加: 「！」による強制指定を最優先でマージ
  for (const idx in extraForcedReadings) {
    forcedReadings[idx] = extraForcedReadings[idx];
  }

  // エンジンがまだない場合は特例ルールのみ適用して返す
  if (!tokenizer) {
    let res = [];
    for (let i = 0; i < rawText.length; i++) {
      res.push({ char: rawText[i], reading: forcedReadings[i] || rawText[i] });
    }
    return res;
  }

  let preText = rawText;
  const correctionRules = [];
  for (const [hira, kanji] of Object.entries(safeWords)) {
    correctionRules.push({
      hira: hira, kanji: kanji,
      pattern: hira === 'はへん' ? /(^|[、。,\s，.！!？?])はへん/g : new RegExp(hira, 'g')
    });
  }
  for (let rule of correctionRules) {
    preText = preText.replace(rule.pattern, (m) => m.replace(rule.hira, rule.kanji));
  }

  const tokens = tokenizer.tokenize(preText);
  let charArray = [];
  let charIndex = 0;

  tokens.forEach((token, tIndex) => {
    for (let rule of correctionRules) {
      if (token.surface_form === rule.kanji) {
        token.surface_form = rule.hira; token.pronunciation = rule.hira;
      }
    }

    const isStart = tIndex === 0 || /^[、。,\s]$/.test(tokens[tIndex - 1].surface_form);
    if (isStart && token.pos === '助詞') {
      // 文頭の助詞は、自動変換がオンの場合でも通常は読み(wa)ではなく文字(ha)として扱う（例：「は、...」）
      if (token.surface_form === 'は') token.pronunciation = 'ハ';
      if (token.surface_form === 'へ') token.pronunciation = 'ヘ';
    }

    const surface = token.surface_form;
    let hiraReading = token.pronunciation ? kataToHira(token.pronunciation) : surface;

    // 自動変換が無効な場合、エンジンによる助詞の変換を抑制
    if (!quizConfig.autoParticleConversion) {
      if (token.surface_form === 'は') hiraReading = 'は';
      if (token.surface_form === 'へ') hiraReading = 'へ';
    }

    for (let i = 0; i < surface.length; i++) {
      // ★ 変更: 基本は入力された文字をそのまま優先する
      let r = surface[i];

      // ★ 変更: 「は」と「へ」の場合のみ、AIが推測した読み方(助詞としての わ・え 等)を許可する
      if (surface[i] === 'は' || surface[i] === 'へ') {
        r = hiraReading[i] || surface[i];
      }

      // 「！」や「こんにちは」等の強制指定がある場合は最優先で上書き
      if (forcedReadings[charIndex]) {
        r = forcedReadings[charIndex];
      }

      charArray.push({ char: surface[i], reading: r });
      charIndex++;
    }
  });
  return charArray;
}

function updateAnalyzedData(isQuiz = false) {
  const rawTokens = isQuiz ? quizInputTokens : inputTokens;
  const targetData = isQuiz ? quizDisplayData : displayData;
  if (rawTokens.length === 0) {
    if (isQuiz) quizDisplayData = []; else displayData = [];
    return;
  }
  const rawText = rawTokens.join('');
  // ★ 追加: クイズ中の場合は、お題に設定された強制ルビ情報を渡す
  const extraForced = isQuiz ? currentTargetForcedReadings : {};
  const charMap = getReadingMap(rawText, extraForced);

  const newData = [];
  let mapIndex = 0;

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    if (token === "は" || token === "へ") {
      const mapInfo = charMap[mapIndex];
      let reading = token; let isModified = false;
      if (mapInfo && mapInfo.reading !== token) { reading = mapInfo.reading; isModified = true; }

      const oldItem = targetData[i];
      let isManual = false; let finalReading = reading;
      // ★ 変更: Sticky Rubyロジック
      // 1. すでに手動で変更されている場合はそれを最優先
      if (oldItem && oldItem.token === token && oldItem.isManual) {
        isManual = true;
        finalReading = oldItem.reading;
      }
      // 2. 手動でないが、以前の解析で「助詞(わ/え)」と判定されていた場合は、その結果を維持する
      // (これにより「がっこうは」→「がっこうはた」になった時にルビが消えるのを防ぐ)
      else if (oldItem && oldItem.token === token && oldItem.isModified) {
        finalReading = oldItem.reading;
      }

      newData.push({ token: token, isHaHe: true, reading: finalReading, isModified: finalReading !== token, isManual: isManual });
    } else {
      newData.push({ token: token, isHaHe: false, reading: token, isModified: false, isManual: false });
    }
    mapIndex += token.length;
  }
  if (isQuiz) quizDisplayData = newData; else displayData = newData;
}

// ★ 新規: iOS/iPadOSの無音化対策（バックグラウンド復帰時などのAudioContext強制復帰）
const unlockAudioContext = () => {
  if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
    audioCtx.resume();
  }
};
['touchstart', 'mousedown', 'touchend', 'click'].forEach(evt => {
  document.addEventListener(evt, unlockAudioContext, { passive: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    unlockAudioContext();
  }
});

// ★ 新規: iOS/iPadOSの音量低下（ダッキング）対策（録音終了時のオーディオセッションリセット）
const resetAudioSession = () => {
  // 1サンプルのみの無音WAVデータのData URI
  const dummyAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
  dummyAudio.volume = 0.01;
  dummyAudio.play().catch(() => { });
};

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => { db = e.target.result; resolve(db); };
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function loadAudioDataFromDB() {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = async (event) => {
      const results = event.target.result;
      recordedAudio.clear();
      audioModePref.clear();
      recordBuffers.clear();

      for (const item of results) {
        if (item.data) {
          recordedAudio.add(item.id);
          try {
            const audioBuf = await audioCtx.decodeAudioData(item.data);
            recordBuffers.set(item.id, audioBuf);
          } catch (e) { console.warn("DB Decode Error", e); }
        }
        if (item.mode && item.mode !== 'synth') {
          audioModePref.set(item.id, item.mode);
        }
      }
      resolve();
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function getAudioFromDB(id) {
  if (!db) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e.target.error);
  });
}

function saveDataToDB(id, type, arrayBuffer, mode, mimeType) {
  if (!db) return Promise.reject("DB is not ready");
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const data = { id, type, data: arrayBuffer, mode, mimeType };
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

async function updateAudioModeInDB(id, type, mode) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = (e) => {
      let recordData = e.target.result;
      if (!recordData) recordData = { id, type, data: null, mode, mimeType: null };
      else recordData.mode = mode;
      const putReq = store.put(recordData);
      putReq.onsuccess = () => resolve();
      putReq.onerror = (err) => reject(err.target.error);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

function deleteFromDB(id) {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

async function exportBackup() {
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      const results = event.target.result;
      const backupData = results.map(item => {
        const dataObj = { ...item };
        if (dataObj.data) dataObj.data = arrayBufferToBase64(dataObj.data);
        return dataObj;
      });

      const jsonString = JSON.stringify(backupData);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      const date = new Date();
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      a.download = `hiragana_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function importBackup(file) {
  if (!db) return Promise.reject("DB not ready");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backupData = JSON.parse(e.target.result);
        if (!Array.isArray(backupData)) throw new Error("Invalid backup format");

        const clearTx = db.transaction([STORE_NAME], "readwrite");
        const clearStore = clearTx.objectStore(STORE_NAME);
        clearStore.clear();

        clearTx.oncomplete = () => {
          const putTx = db.transaction([STORE_NAME], "readwrite");
          const putStore = putTx.objectStore(STORE_NAME);
          let errorOccurred = false;
          putTx.onerror = (err) => { errorOccurred = true; reject(err); };
          putTx.oncomplete = () => { if (!errorOccurred) resolve(); };

          backupData.forEach(item => {
            const dataObj = { ...item };
            if (dataObj.data) dataObj.data = base64ToArrayBuffer(dataObj.data);
            putStore.put(dataObj);
          });
        };
        clearTx.onerror = (err) => reject(err.target.error);
      } catch (err) { reject(err); }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
}

// ★ 追加: 録音の「さ、し、す、せ、そ」など耳障りな高音（歯擦音）を抑えるローパスフィルター処理
async function applyLowPassFilter(audioBuffer) {
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const filter = offlineCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 7000; // 7kHz以上をカットして耳障りなS音を和らげる
  filter.Q.value = 0.5;

  source.connect(filter);
  filter.connect(offlineCtx.destination);
  source.start();

  return await offlineCtx.startRendering();
}

function trimAudioBuffer(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.02);
  const rmsValues = [];

  for (let i = 0; i < channelData.length; i += windowSize) {
    let sumSquares = 0; let count = 0;
    for (let j = 0; j < windowSize && i + j < channelData.length; j++) {
      sumSquares += channelData[i + j] * channelData[i + j]; count++;
    }
    rmsValues.push(Math.sqrt(sumSquares / count));
  }

  const sortedRms = [...rmsValues].sort((a, b) => a - b);
  const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.1)] || 0.001;
  const maxRms = sortedRms[sortedRms.length - 1] || 0.01;

  // ★ 変更: カットする閾値を少し緩める (0.25 -> 0.15, 下限 0.015 -> 0.01)
  let threshold = noiseFloor + (maxRms - noiseFloor) * 0.15;
  if (threshold < 0.01) threshold = 0.01;

  let startWindow = 0; let endWindow = rmsValues.length - 1;
  const marginWindows = 5;

  for (let i = 0; i < rmsValues.length; i++) {
    if (rmsValues[i] > threshold) { startWindow = Math.max(0, i - marginWindows); break; }
  }
  for (let i = rmsValues.length - 1; i >= 0; i--) {
    if (rmsValues[i] > threshold) { endWindow = Math.min(rmsValues.length - 1, i + marginWindows); break; }
  }

  let startIdx = startWindow * windowSize;
  let endIdx = Math.min(channelData.length - 1, (endWindow + 1) * windowSize);

  if (startIdx >= endIdx || maxRms < 0.01) return audioBuffer;

  const trimmedLength = endIdx - startIdx;
  const trimmedAudioBuffer = audioCtx.createBuffer(audioBuffer.numberOfChannels, trimmedLength, sampleRate);

  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    const channel = audioBuffer.getChannelData(i);
    const trimmedChannel = trimmedAudioBuffer.getChannelData(i);
    for (let j = 0; j < trimmedLength; j++) { trimmedChannel[j] = channel[startIdx + j]; }
  }

  // ★ 追加: ノーマライズ（自動音量最大化）処理
  // AGCをオフにしたことで録音音量が下がるため、波形全体の最大音量を調べて、
  // 音割れしないギリギリ（95%）まで波形全体を均等に増幅させる
  let peak = 0;
  for (let i = 0; i < trimmedAudioBuffer.numberOfChannels; i++) {
    const channelData = trimmedAudioBuffer.getChannelData(i);
    for (let j = 0; j < channelData.length; j++) {
      const absVal = Math.abs(channelData[j]);
      if (absVal > peak) peak = absVal;
    }
  }

  // ピークが0.01以上の有意な音が含まれている場合のみ増幅する
  if (peak > 0.01) {
    const targetPeak = 0.95; // 95% (音割れマージン)
    let multiplier = targetPeak / peak;
    // 極端な増幅（ホワイトノイズの爆音化）を防ぐための上限キャップ
    if (multiplier > 10.0) multiplier = 10.0;

    if (multiplier > 1.0) {
      for (let i = 0; i < trimmedAudioBuffer.numberOfChannels; i++) {
        const channelData = trimmedAudioBuffer.getChannelData(i);
        for (let j = 0; j < channelData.length; j++) {
          channelData[j] = channelData[j] * multiplier;
        }
      }
    }
  }

  return trimmedAudioBuffer;
}

function sliceAudioBuffer(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;

  let startSample = Math.floor(startSec * sampleRate);
  let endSample = Math.floor(endSec * sampleRate);

  startSample = Math.max(0, startSample);
  endSample = Math.min(buffer.length, endSample);
  if (startSample >= endSample) { startSample = 0; endSample = 1; }

  const length = endSample - startSample;
  const slicedBuffer = audioCtx.createBuffer(channels, length, sampleRate);

  for (let i = 0; i < channels; i++) {
    const channelData = buffer.getChannelData(i);
    const slicedData = slicedBuffer.getChannelData(i);
    for (let j = 0; j < length; j++) { slicedData[j] = channelData[startSample + j]; }
  }
  return slicedBuffer;
}

function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferData = new ArrayBuffer(length);
  const view = new DataView(bufferData);
  const channels = [];
  let offset = 0, pos = 0;
  const setU16 = d => { view.setUint16(offset, d, true); offset += 2; };
  const setU32 = d => { view.setUint32(offset, d, true); offset += 4; };

  setU32(0x46464952); setU32(length - 8); setU32(0x45564157); setU32(0x20746d66);
  setU32(16); setU16(1); setU16(numOfChan); setU32(buffer.sampleRate);
  setU32(buffer.sampleRate * 2 * numOfChan); setU16(numOfChan * 2); setU16(16);
  setU32(0x61746164); setU32(length - pos - 44);

  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  while (pos < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][pos]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(offset, sample, true); offset += 2;
    }
    pos++;
  }
  return bufferData;
}

const createKeepAlive = () => {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start();
};

const playBeep = (freq) => {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = seVolume * 0.5;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) { }
};

const playSound = (filename, volume = 1.0) => {
  const buf = seBuffers.get(filename);
  if (!buf) return;
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buf;
  gain.gain.value = volume * seVolume;
  source.connect(gain); gain.connect(audioCtx.destination);
  source.start(0);
};

const playAudioPromise = (buffer, vol = 1.0) => {
  return new Promise(resolve => {
    if (!buffer) { resolve(); return; }
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = buffer;
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.onended = () => resolve();
    source.start(0);
    activeSourceNodes.push(source);
  });
};

// ★ 追加: エコー（ディレイ）エフェクト付きの再生
const playAudioWithEffect = (buffer, vol = 1.0) => {
  return new Promise(resolve => {
    if (!buffer) { resolve(); return; }
    const source = audioCtx.createBufferSource();
    const mainGain = audioCtx.createGain();
    const delay = audioCtx.createDelay();
    const feedback = audioCtx.createGain();
    const echoGain = audioCtx.createGain();

    source.buffer = buffer;
    mainGain.gain.value = vol;
    delay.delayTime.value = 0.25; // 250msのディレイ
    feedback.gain.value = 0.4;    // 40%のフィードバック
    echoGain.gain.value = 0.5;    // エコー自体の音量

    // メイン音（ドライ）
    source.connect(mainGain);
    mainGain.connect(audioCtx.destination);

    // エコー音（ウェット）
    source.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay); // フィードバックループ
    delay.connect(echoGain);
    echoGain.connect(audioCtx.destination);

    source.onended = () => resolve();
    source.start(0);
    activeSourceNodes.push(source);
  });
};

const setBearMouth = (isOpen) => {
  const bearImg = document.getElementById('bear-mascot');
  if (bearImg) bearImg.src = isOpen ? 'bear_1.png' : (inputTokens.length > 0 ? 'bear_0.png' : 'bear_3.png');
};

const getAudioBufferForNode = (id) => {
  const mode = audioModePref.get(id) || 'sample';
  if (mode === 'record' && recordBuffers.has(id)) return recordBuffers.get(id);
  const fileName = window.HIRAGANA_DATA.fileNameMap[id] || id;
  return sampleBuffers.get(`${fileName}.wav`);
};

let playbackDelay = 100;
let activeSourceNodes = [];
let sequenceTimeouts = [];
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const cancelSequence = () => {
  isSpeakingSequence = false;
  activeSourceNodes.forEach(node => { try { node.stop(); } catch (e) { } });
  activeSourceNodes = [];
  sequenceTimeouts.forEach(t => clearTimeout(t));
  sequenceTimeouts = [];
  setBearMouth(false); sequenceIndex = -1;
  updateTextDisplay();
};

const showMessage = (htmlContent) => {
  const messageModal = document.getElementById('message-modal');
  const messageModalText = document.getElementById('message-modal-text');
  if (messageModal && messageModalText) {
    messageModalText.innerHTML = htmlContent;
    messageModal.classList.remove('hidden');
    messageModal.classList.add('flex');
  }
};

const playSequence = () => {
  // ★変更: 判定を displayData に変更
  if (displayData.length === 0 || currentQuizMode !== null) return;
  cancelSequence();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  isSpeakingSequence = true; sequenceIndex = -1; updateTextDisplay();
  let startTime = audioCtx.currentTime + 0.1;
  let previousChar = null;

  // ★変更: ループ対象を displayData に変更
  for (let i = 0; i < displayData.length; i++) {
    // ★変更: 文字ではなく、解析済みの reading を使用
    const token = displayData[i].reading;
    let duration = 0; let isSilent = false; let buffersToPlay = [];
    let overlapOffset = 0;

    if (['、', '。', ' ', '　', 'っ'].includes(token)) {
      duration = (token === '。' ? 0.6 : 0.3) + (playbackDelay / 1000);
      isSilent = true; previousChar = token;
    }
    else if (token === 'ー') {
      if (!previousChar || ['っ', '、', '。', ' ', '　'].includes(previousChar)) {
        duration = 0.3 + (playbackDelay / 1000); isSilent = true;
      } else {
        const vowel = getVowel(previousChar) || 'あ';
        const buf = getAudioBufferForNode(vowel);
        if (buf) {
          const skipStart = 0.01;
          overlapOffset = 0.12;
          buffersToPlay.push({ buffer: buf, char: 'ー', isLongVowel: true, skipStart: skipStart });
          duration = Math.max(0, buf.duration - skipStart) + (playbackDelay / 1000);
        }
        else { duration = 0.5 + (playbackDelay / 1000); isSilent = true; }
      }
    }
    else if (token.length > 1 && token !== '、 。' && token !== 'っ ー') {
      const buf = getAudioBufferForNode(token);
      if (buf) { buffersToPlay.push({ buffer: buf, char: token }); duration = buf.duration + (playbackDelay / 1000); previousChar = token[token.length - 1]; }
      else {
        for (let j = 0; j < token.length; j++) {
          const c = token[j]; const cBuf = getAudioBufferForNode(c);
          if (cBuf) { buffersToPlay.push({ buffer: cBuf, char: c }); duration += cBuf.duration + (playbackDelay / 1000); }
          else { duration += 0.5 + (playbackDelay / 1000); }
          previousChar = c;
        }
      }
    }
    else {
      const buf = getAudioBufferForNode(token);
      if (buf) { buffersToPlay.push({ buffer: buf, char: token }); duration = buf.duration + (playbackDelay / 1000); }
      else { duration = 0.5 + (playbackDelay / 1000); isSilent = true; }
      previousChar = token;
    }

    sequenceTimeouts.push(setTimeout(() => { if (isSpeakingSequence) { sequenceIndex = i; updateTextDisplay(); } }, (startTime - audioCtx.currentTime) * 1000));

    if (!isSilent && buffersToPlay.length > 0) {
      let nodeStartTime = Math.max(audioCtx.currentTime + 0.01, startTime - overlapOffset);

      buffersToPlay.forEach(item => {
        const source = audioCtx.createBufferSource(); const gain = audioCtx.createGain();
        source.buffer = item.buffer;

        if (item.isLongVowel) {
          gain.gain.setValueAtTime(0, nodeStartTime);
          gain.gain.linearRampToValueAtTime(audioVolume, nodeStartTime + 0.02);
          source.connect(gain); gain.connect(audioCtx.destination);
          source.start(nodeStartTime, item.skipStart);
        } else {
          gain.gain.value = audioVolume;
          source.connect(gain); gain.connect(audioCtx.destination);
          source.start(nodeStartTime);
        }
        activeSourceNodes.push(source);

        const playLen = item.isLongVowel ? Math.max(0, item.buffer.duration - item.skipStart) : item.buffer.duration;

        sequenceTimeouts.push(setTimeout(() => { if (isSpeakingSequence) setBearMouth(true); }, (nodeStartTime - audioCtx.currentTime) * 1000));
        sequenceTimeouts.push(setTimeout(() => { if (isSpeakingSequence) setBearMouth(false); }, (nodeStartTime + playLen - audioCtx.currentTime) * 1000));

        nodeStartTime += playLen + (playbackDelay / 1000);
      });
    }

    startTime = startTime - overlapOffset + duration;
  }

  sequenceTimeouts.push(setTimeout(() => {
    if (isSpeakingSequence) { sequenceIndex = -1; updateTextDisplay(); isSpeakingSequence = false; setBearMouth(false); }
  }, (startTime - audioCtx.currentTime) * 1000));
};

const updateRecordButtons = () => {
  if (!isRecordMode) return;
  const btnPlay = document.getElementById('btn-record-play');
  const btnTrimOpen = document.getElementById('btn-trim-open');
  const btnClear = document.getElementById('btn-record-clear');
  const btnSample = document.getElementById('btn-audio-sample');
  const btnRecord = document.getElementById('btn-audio-record');

  const btnImport = document.getElementById('btn-record-import');
  const btnRecordStart = document.getElementById('btn-record-start');

  if (!currentRecordTarget) {
    btnPlay.classList.add('opacity-50', 'cursor-not-allowed');
    btnTrimOpen.classList.add('opacity-50', 'cursor-not-allowed');
    btnClear.classList.add('opacity-50', 'cursor-not-allowed');
    btnSample.className = 'flex-1 rounded-[0.4cqw] font-bold transition-colors flex items-center justify-center bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed';
    btnRecord.className = 'flex-1 rounded-[0.4cqw] font-bold transition-colors flex items-center justify-center bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed';
    if (btnImport) { btnImport.classList.add('opacity-50', 'cursor-not-allowed'); btnImport.disabled = true; }
    if (btnRecordStart) { btnRecordStart.classList.add('opacity-50', 'cursor-not-allowed'); btnRecordStart.disabled = true; }
    return;
  } else {
    if (btnImport) { btnImport.classList.remove('opacity-50', 'cursor-not-allowed'); btnImport.disabled = false; }
    if (btnRecordStart && !isCountingDown && !isRecording) { btnRecordStart.classList.remove('opacity-50', 'cursor-not-allowed'); btnRecordStart.disabled = false; }
  }

  const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;
  const isRecorded = recordedAudio.has(targetId);
  const currentMode = audioModePref.get(targetId) || 'sample';

  btnPlay.classList.remove('opacity-50', 'cursor-not-allowed');

  if (isRecorded) {
    btnClear.classList.remove('opacity-50', 'cursor-not-allowed');
    btnTrimOpen.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    btnClear.classList.add('opacity-50', 'cursor-not-allowed');
    btnTrimOpen.classList.add('opacity-50', 'cursor-not-allowed');
  }

  const activeClass = 'flex-1 rounded-[0.4cqw] font-bold transition-colors flex items-center justify-center shadow-sm bg-white border-2 ';
  const inactiveClass = 'flex-1 rounded-[0.4cqw] font-bold transition-colors flex items-center justify-center bg-transparent text-gray-600 hover:bg-white/50 cursor-pointer ';
  const disabledClass = 'flex-1 rounded-[0.4cqw] font-bold transition-colors flex items-center justify-center bg-gray-200 text-gray-400 opacity-50 cursor-not-allowed ';

  if (currentMode === 'sample') btnSample.className = activeClass + 'text-yellow-600 border-yellow-300';
  else btnSample.className = inactiveClass;

  if (isRecorded) {
    if (currentMode === 'record') btnRecord.className = activeClass + 'text-red-600 border-red-300';
    else btnRecord.className = inactiveClass;
  } else {
    btnRecord.className = disabledClass;
  }
};

// ★変更: displayData を使って文字を描画するように変更
const updateTextDisplay = () => {
  const display = document.getElementById('input-text-display');
  const isQuiz = currentQuizMode !== null;
  const currentData = isQuiz ? quizDisplayData : displayData;

  if (isQuiz && currentData.length === 0) {
    const hintText = currentQuizMode === 3 ? "よくきいてこたえよう" : "よくきいてさがそう";
    display.innerHTML = `<span style="color: #3b82f6; font-size: 2.5cqw;">${hintText}</span>`;
  } else if (!isQuiz && currentData.length === 0) {
    display.innerHTML = `<span style="color: #d1d5db; font-weight: normal;">あいうえお...</span>`;
  } else {
    let html = '';
    for (let i = 0; i < currentData.length; i++) {
      const item = currentData[i];
      const idAttr = (!isQuiz && i === sequenceIndex) ? 'id="current-highlight"' : '';
      const isHighlighted = (!isQuiz && sequenceIndex >= 0 && i <= sequenceIndex);
      const colorStyle = isHighlighted ? '#ef4444' : 'inherit';

      if (item.isHaHe) {
        const rubyText = item.reading;
        const rubyColor = item.isManual ? '#9333ea' : '#ef4444';
        let rubyHtml = '';
        // 自動変更されたか、手動で変更された場合にルビを表示
        if (item.isManual || item.isModified) {
          rubyHtml = `<span style="position: absolute; bottom: 85%; left: 50%; transform: translateX(-50%); font-size: 1.2cqw; background: rgba(255,255,255,0.9); border-radius: 0.2cqw; padding: 0 0.2cqw; line-height: 1; color: ${rubyColor}; font-weight: bold; box-shadow: 0 0.1cqw 0.2cqw rgba(0,0,0,0.1);">${rubyText}</span>`;
        }
        // ★修正: onclick属性をやめて、classとdata属性でイベントデリゲーションを行うように変更
        html += `<span ${idAttr} class="ha-he-toggle" data-index="${i}" data-is-quiz="${isQuiz}" style="position: relative; display: inline-block; cursor: pointer; color: ${colorStyle}; transition: color 0.1s; padding: 0 0.4cqw; margin: 0 -0.1cqw;">${rubyHtml}${item.token}<span style="position: absolute; bottom: -0.1cqw; left: 0; right: 0; border-bottom: 0.2cqw dashed #9333ea;"></span></span>`;
      } else {
        html += `<span ${idAttr} style="color: ${colorStyle}; transition: color 0.1s;">${item.token}</span>`;
      }
    }
    if (isQuiz) display.innerHTML = `<span style="color: #1f2937; font-size: 2.5cqw;">${html}</span>`;
    else display.innerHTML = html;
  }

  const container = document.getElementById('text-container-ref');
  if (sequenceIndex >= 0 && currentQuizMode === null) {
    const hlElem = document.getElementById('current-highlight');
    if (hlElem) hlElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else { container.scrollTop = container.scrollHeight; }

  const bearBtn = document.getElementById('bear-mascot-container');
  const bearClickArea = document.getElementById('bear-click-area');
  const bearImg = document.getElementById('bear-mascot');
  const scoreContainer = document.getElementById('quiz-score-container');

  if (currentQuizMode !== null) {
    if (bearBtn) bearBtn.classList.add('opacity-0');
    if (bearClickArea) bearClickArea.classList.add('pointer-events-none');
    if (scoreContainer) {
      scoreContainer.classList.remove('hidden');
      scoreContainer.classList.add('flex');
    }
  } else {
    if (bearBtn) bearBtn.classList.remove('opacity-0');
    if (scoreContainer) {
      scoreContainer.classList.add('hidden');
      scoreContainer.classList.remove('flex');
    }
    if (displayData.length === 0) {
      if (bearClickArea) bearClickArea.classList.add('pointer-events-none');
      if (bearImg && !isSpeakingSequence) bearImg.src = 'bear_3.png';
    } else {
      if (bearClickArea) bearClickArea.classList.remove('pointer-events-none');
      if (bearImg && !isSpeakingSequence) bearImg.src = 'bear_0.png';
    }
  }
};

const updateTabUI = () => {
  const isShow = quizConfig.showTabs;
  const tabNames = { 1: 'もんだい①', 2: 'もんだい②', 3: 'もんだい③' };

  const isQ3Empty = !quizConfig.q3.list || quizConfig.q3.list.trim() === '';

  const btnQ3Play = document.getElementById('btn-q3-play');
  const btnQ3Submit = document.getElementById('btn-q3-submit');

  [1, 2, 3].forEach(num => {
    const btn = document.getElementById(`btn-tab-q${num}`);
    if (!btn) return;

    if (!isShow) {
      btn.style.visibility = 'hidden';
      btn.style.pointerEvents = 'none';
    } else {
      if (currentQuizMode === 3) {
        if (num === 1 || num === 2) {
          btn.style.visibility = 'hidden';
          btn.style.pointerEvents = 'none';
        } else if (num === 3) {
          btn.style.visibility = 'visible';
          btn.style.pointerEvents = 'auto';
          btn.textContent = 'おわる';
        }
      } else if ((currentQuizMode === 1 && num !== 1) || (currentQuizMode === 2 && num !== 2)) {
        btn.style.visibility = 'hidden';
        btn.style.pointerEvents = 'none';
      } else {
        if (num === 3 && isQ3Empty) {
          btn.style.visibility = 'hidden';
          btn.style.pointerEvents = 'none';
        } else {
          btn.style.visibility = 'visible';
          btn.style.pointerEvents = 'auto';
          if ((currentQuizMode === 1 && num === 1) || (currentQuizMode === 2 && num === 2)) {
            btn.textContent = 'おわる';
          } else {
            btn.textContent = tabNames[num];
          }
        }
      }
    }

    if (currentQuizMode === num) {
      btn.classList.add('scale-y-90', 'brightness-90');
      btn.style.boxShadow = 'inset 0 0.4cqw 0.8cqw rgba(0,0,0,0.2)';
      btn.style.borderBottomWidth = '0';
    } else {
      btn.classList.remove('scale-y-90', 'brightness-90');
      btn.style.boxShadow = '0 -0.2cqw 0.4cqw rgba(0,0,0,0.15)';
      btn.style.borderBottomWidth = '0';
    }
  });

  // ★ 修正: Q2でロックしない場合にも「さいせい」ボタンを表示する
  const showPlayBtn = (currentQuizMode === 3 && isShow) || (currentQuizMode === 2 && !quizConfig.q2.lock && isShow);

  if (showPlayBtn) {
    if (btnQ3Play) { btnQ3Play.classList.remove('hidden'); btnQ3Play.classList.add('flex'); }
    document.getElementById('btn-tab-q1').style.display = 'none';
  } else {
    if (btnQ3Play) { btnQ3Play.classList.add('hidden'); btnQ3Play.classList.remove('flex'); }
    document.getElementById('btn-tab-q1').style.display = '';
  }

  if (currentQuizMode === 3 && isShow) {
    if (btnQ3Submit) { btnQ3Submit.classList.remove('hidden'); btnQ3Submit.classList.add('flex'); }
    document.getElementById('btn-tab-q2').style.display = 'none';
  } else {
    if (btnQ3Submit) { btnQ3Submit.classList.add('hidden'); btnQ3Submit.classList.remove('flex'); }
    document.getElementById('btn-tab-q2').style.display = '';
  }

  const repeatBtn = document.getElementById('btn-quiz-repeat');
  if (currentQuizMode !== null) {
    repeatBtn.classList.remove('hidden');
    repeatBtn.classList.add('flex');
  } else {
    repeatBtn.classList.add('hidden');
    repeatBtn.classList.remove('flex');
  }
};

const updateButtons = () => {
  const btnSeion = document.getElementById('btn-seion'); const btnDakuon = document.getElementById('btn-dakuon');
  const btnChar = document.getElementById('btn-char'); const btnName = document.getElementById('btn-name');
  const activeBase = "font-bold transition-all duration-200 flex items-center justify-center leading-tight text-white";
  const inactiveBase = "font-bold transition-all duration-200 flex items-center justify-center leading-tight bg-transparent text-gray-500 hover:bg-white/50";

  if (boardType === 'seion') { btnSeion.className = activeBase + " bg-red-500"; btnSeion.style.boxShadow = "0 0.4cqw 0 #991b1b"; btnSeion.style.transform = "translateY(-0.2cqw)"; }
  else { btnSeion.className = inactiveBase; btnSeion.style.boxShadow = "none"; btnSeion.style.transform = "none"; }

  if (boardType === 'dakuon') { btnDakuon.className = activeBase + " bg-blue-600"; btnDakuon.style.boxShadow = "0 0.4cqw 0 #1e3a8a"; btnDakuon.style.transform = "translateY(-0.2cqw)"; }
  else { btnDakuon.className = inactiveBase; btnDakuon.style.boxShadow = "none"; btnDakuon.style.transform = "none"; }

  if (playMode === 'char') { btnChar.className = activeBase + " bg-green-500"; btnChar.style.boxShadow = "0 0.4cqw 0 #166534"; btnChar.style.transform = "translateY(-0.2cqw)"; }
  else { btnChar.className = inactiveBase; btnChar.style.boxShadow = "none"; btnChar.style.transform = "none"; }

  if (playMode === 'name') { btnName.className = activeBase + " bg-purple-500"; btnName.style.boxShadow = "0 0.4cqw 0 #581c87"; btnName.style.transform = "translateY(-0.2cqw)"; }
  else { btnName.className = inactiveBase; btnName.style.boxShadow = "none"; btnName.style.transform = "none"; }
};

const updateQuizScoreDisplay = () => {
  const correctElem = document.getElementById('quiz-score-correct');
  const totalElem = document.getElementById('quiz-score-total');
  if (correctElem) correctElem.textContent = quizCorrectCount;
  if (totalElem) totalElem.textContent = quizTotalCount;
};

// ★ 変更: 「！」を解析してオブジェクトに分離する
const parseQuizList = (text) => {
  if (!text) return [];
  const rawList = text.split(/[、,　 \n]+/).map(s => s.trim()).filter(s => s.length > 0);
  return rawList.map(rawStr => {
    let cleanStr = "";
    let forced = {};
    let cleanIndex = 0;
    for (let i = 0; i < rawStr.length; i++) {
      if (rawStr[i] === '！' || rawStr[i] === '!') {
        if (cleanIndex > 0) {
          if (cleanStr[cleanIndex - 1] === 'は') forced[cleanIndex - 1] = 'わ';
          else if (cleanStr[cleanIndex - 1] === 'へ') forced[cleanIndex - 1] = 'え';
        }
      } else {
        cleanStr += rawStr[i];
        cleanIndex++;
      }
    }
    return { original: rawStr, text: cleanStr, forcedReadings: forced };
  });
};

const getAllChars = () => [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells].filter(c => c.char && !c.char.includes(' ')).map(c => c.char);
const getAllWords = () => [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells].filter(c => c.word).map(c => c.word);

const playTokensSequence = async (tokens) => {
  for (let j = 0; j < tokens.length; j++) {
    if (!isQuizPlaying) break;
    const token = tokens[j];

    if (token === 'っ') {
      await new Promise(r => setTimeout(r, 300));
    } else if (token === 'ー') {
      let prevChar = j > 0 ? tokens[j - 1] : null;
      if (prevChar && prevChar !== 'っ' && prevChar !== '、' && prevChar !== '。') {
        const vowel = getVowel(prevChar[prevChar.length - 1]) || 'あ';
        const buf = getAudioBufferForNode(vowel);
        if (buf) {
          setBearMouth(true);
          await playAudioPromise(buf, audioVolume);
          setBearMouth(false);
        }
      } else {
        await new Promise(r => setTimeout(r, 300));
      }
    } else if (token !== '、' && token !== '。' && token !== ' ' && token !== '　') {
      const buf = getAudioBufferForNode(token);
      if (buf) {
        setBearMouth(true);
        await playAudioPromise(buf, audioVolume);
        setBearMouth(false);
      }
    } else {
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, playbackDelay));
  }
};

const playStringSequence = async (str, forcedReadings = {}) => {
  const charMap = getReadingMap(str, forcedReadings);
  let tokens = [];
  let i = 0;
  const allTokens = [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells]
    .flatMap(c => c.char.includes(' ') ? c.char.split(' ') : [c.char])
    .sort((a, b) => b.length - a.length);

  while (i < str.length) {
    let found = false;
    for (let t of allTokens) {
      if (str.startsWith(t, i)) {
        // ★ 修正: 1文字の場合は常に charMap の reading（AI補正・強制ルビ）を使用する
        if (t.length === 1) {
          tokens.push(charMap[i] ? charMap[i].reading : t);
        } else {
          tokens.push(t);
        }
        i += t.length;
        found = true;
        break;
      }
    }
    if (!found) {
      tokens.push(charMap[i] ? charMap[i].reading : str[i]);
      i++;
    }
  }
  await playTokensSequence(tokens);
};

const getNextTargetToken = (targetStr, currentInputTokens) => {
  const inputtedStr = currentInputTokens.join('');
  if (!targetStr.startsWith(inputtedStr)) return null;
  const remainingStr = targetStr.slice(inputtedStr.length);
  if (remainingStr.length === 0) return null;

  const allTokens = [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells]
    .flatMap(c => c.char.includes(' ') ? c.char.split(' ') : [c.char])
    .sort((a, b) => b.length - a.length); // 長い文字（きゃ等）から探す

  for (let token of allTokens) {
    if (remainingStr.startsWith(token)) {
      return token;
    }
  }
  return remainingStr[0]; // 万が一見つからなければ1文字目を返す
};

// ★ 新規: ヒント設定に応じて、対象文字が含まれるボードへ自動で切り替える関数
const checkAndSwitchBoard = () => {
  if (currentQuizMode === null) return;
  const config = quizConfig[`q${currentQuizMode}`];
  if (config.hint === 'none' || !currentTargetString) return;

  let targetToken = null;
  if (playMode === 'name') {
    targetToken = currentTargetString;
    const inSeion = window.HIRAGANA_DATA.seionCells.some(c => c.word === targetToken || c.char === targetToken);
    const inDakuon = window.HIRAGANA_DATA.dakuonCells.some(c => c.word === targetToken || c.char === targetToken);
    if (inSeion && boardType !== 'seion') {
      boardType = 'seion';
      if (typeof updateButtons === 'function') updateButtons();
    } else if (inDakuon && !inSeion && boardType !== 'dakuon') {
      boardType = 'dakuon';
      if (typeof updateButtons === 'function') updateButtons();
    }
  } else {
    targetToken = getNextTargetToken(currentTargetString, quizInputTokens);
    if (targetToken) {
      const inSeion = window.HIRAGANA_DATA.seionCells.some(c => c.char === targetToken || (c.char.includes(' ') && c.char.split(' ').includes(targetToken)));
      const inDakuon = window.HIRAGANA_DATA.dakuonCells.some(c => c.char === targetToken || (c.char.includes(' ') && c.char.split(' ').includes(targetToken)));
      if (inSeion && boardType !== 'seion') {
        boardType = 'seion';
        if (typeof updateButtons === 'function') updateButtons();
      } else if (inDakuon && !inSeion && boardType !== 'dakuon') {
        boardType = 'dakuon';
        if (typeof updateButtons === 'function') updateButtons();
      }
    }
  }
};

const startQuiz = async (quizNum) => {
  if (isRecordMode || isQuizPlaying) return;
  cancelSequence();

  // ★ 変更: 前の問題のヒントタイマーが残っていたら確実に消して、ヒントを非表示に固定
  if (quizHintTimeout) {
    clearTimeout(quizHintTimeout);
    quizHintTimeout = null;
  }
  quizHintActive = false;

  currentQuizMode = quizNum;
  currentQuizIndex = 0;
  quizRetryCount = 0;
  quizCorrectCount = 0;
  quizInputTokens = [];
  updateAnalyzedData(true);
  wrongAnswerCells.clear();
  correctAnswerCell = null;
  currentTargetString = "";
  currentTargetForcedReadings = {}; // ★追加
  quizHintActive = false; // ★追加

  const config = quizConfig[`q${quizNum}`];

  if (quizNum === 1 && config.lock) playMode = 'char';
  if (quizNum === 2 && config.lock) playMode = 'name';

  if (typeof renderBoard === 'function') window.CANVAS_ENGINE.renderBoard(getAppState());
  if (typeof updateButtons === 'function') updateButtons();
  if (typeof updateTabUI === 'function') updateTabUI();
  if (typeof updateTextDisplay === 'function') updateTextDisplay();

  if (config.type === 'random' || config.type === 'seion-random') {
    quizQuestions = null;
  } else {
    let list = parseQuizList(config.list);
    if (list.length === 0) {
      quizQuestions = null;
    } else {
      if (config.type === 'list-rand') list = list.sort(() => Math.random() - 0.5);
      quizQuestions = list;
    }
  }

  if (quizQuestions !== null) {
    quizTotalCount = quizQuestions.length;
  } else {
    quizTotalCount = 0;
  }
  updateQuizScoreDisplay();

  isQuizPlaying = true;
  // ★ もんだい番号に応じた音声（q_mondai1.mp3, q_mondai2.mp3, q_mondai3.mp3）が再生されます
  await playAudioPromise(seBuffers.get(`q_mondai${quizNum}.mp3`), audioVolume);
  await new Promise(r => setTimeout(r, 500));
  isQuizPlaying = false;

  nextQuizQuestion(false);
};

// ★ 変更: isOutNext 引数を追加し、上限到達時の音声を出し分ける
const nextQuizQuestion = async (playNextSound = true, isOutNext = false) => {
  if (currentQuizMode === null) return;

  wrongAnswerCells.clear();
  correctAnswerCell = null;
  quizInputTokens = [];
  updateAnalyzedData(true);

  // ★ 変更: オブジェクトから情報を取得
  if (quizQuestions !== null) {
    if (currentQuizIndex >= quizQuestions.length) { endQuiz(true); return; }
    const q = quizQuestions[currentQuizIndex];
    currentTargetString = q.text;
    currentTargetForcedReadings = q.forcedReadings || {};
  } else {
    let pool = [];
    if (currentQuizMode === 1) {
      const config = quizConfig.q1;
      if (config.type === 'seion-random') {
        pool = window.HIRAGANA_DATA.seionCells.filter(c => c.char && !c.char.includes(' ')).map(c => c.char);
      } else {
        pool = getAllChars();
      }
    } else if (currentQuizMode === 2) {
      pool = getAllWords();
    } else {
      pool = [...getAllChars(), ...getAllWords()];
    }
    currentTargetString = pool[Math.floor(Math.random() * pool.length)];
    currentTargetForcedReadings = {}; // ★追加
    quizTotalCount++;
    updateQuizScoreDisplay();
  }

  // ★ 変更: 次の問題をセットする段階では絶対にヒントを表示しない
  if (quizHintTimeout) {
    clearTimeout(quizHintTimeout);
    quizHintTimeout = null;
  }
  quizHintActive = false;

  checkAndSwitchBoard();

  window.CANVAS_ENGINE.renderBoard(getAppState());
  updateTextDisplay();

  quizRetryCount = 0;
  isQuizPlaying = true;

  if (playNextSound) {
    const nextSound = isOutNext ? 'q_outnext.mp3' : 'q_next.mp3';
    await playAudioPromise(seBuffers.get(nextSound), audioVolume);
    await new Promise(r => setTimeout(r, 300));
  }

  // ★ 変更: 出題音声（「ba.wav」や「mikan.wav」など）の再生が完了して0.5秒後にヒント枠を表示する
  quizHintActive = false;
  if (quizHintTimeout) clearTimeout(quizHintTimeout);
  window.CANVAS_ENGINE.renderBoard(getAppState());

  if (currentQuizMode === 3) {
    await playStringSequence(currentTargetString, currentTargetForcedReadings);
  } else {
    const buf = getAudioBufferForNode(currentTargetString);
    if (buf) await playAudioPromise(buf, audioVolume);
  }

  // 音声再生完了後にタイマーをセット
  quizHintTimeout = setTimeout(() => {
    quizHintActive = true;
    window.CANVAS_ENGINE.renderBoard(getAppState());
  }, 500);

  isQuizPlaying = false;
};

const submitQuizAnswer = async (inputtedStr, lastCellChar) => {
  const cleanTargetStr = currentTargetString.replace(/[！!、。 　]/g, '');
  let isCorrect = inputtedStr === cleanTargetStr;

  if (!isCorrect) {
    if (cleanTargetStr === "こんにちは" && inputtedStr === "こんにちわ") isCorrect = true;
    if (cleanTargetStr === "こんばんは" && inputtedStr === "こんばんわ") isCorrect = true;
  }

  let isReadingCorrect = true;
  if (isCorrect && quizDisplayData.length > 0) {
    // ★ 変更: 強制ルビ箇所のチェック
    for (let i = 0; i < quizDisplayData.length; i++) {
      if (currentTargetForcedReadings[i]) {
        if (quizDisplayData[i].reading !== currentTargetForcedReadings[i]) {
          isReadingCorrect = false;
        }
      }
    }

    const lastItem = quizDisplayData[quizDisplayData.length - 1];
    if (cleanTargetStr === "こんにちは" || cleanTargetStr === "こんばんは") {
      if (lastItem.token === 'は' && lastItem.reading !== 'わ') {
        isReadingCorrect = false;
      }
    }
  }

  if (isCorrect && isReadingCorrect) {
    correctAnswerCell = lastCellChar;
    quizCorrectCount++;
    totalQuizCorrectAnswers++;
    quizHintActive = false; // ★ 変更: 正解した瞬間にヒントを消して、次の問題にヒント枠がチラつくのを防ぐ
    try { localStorage.setItem('totalQuizCorrectAnswers', totalQuizCorrectAnswers); } catch (e) { }

    updateQuizScoreDisplay();
    window.CANVAS_ENGINE.renderBoard(getAppState());

    setBearMouth(true);
    await playAudioPromise(seBuffers.get('q_correct.mp3'), audioVolume);
    setBearMouth(false);
    await new Promise(r => setTimeout(r, 500));

    // ★ 追加: ミニゲーム トリガー
    if (totalQuizCorrectAnswers > 0 && totalQuizCorrectAnswers % 20 === 0) {
      if (typeof window !== 'undefined' && window.startMinigame) window.startMinigame();
      return; // Return early, nextQuizQuestion/endQuiz will be called after minigame ends
    }

    // ★ 追加: スタンプの付与チェック
    if (totalQuizCorrectAnswers > 0 && totalQuizCorrectAnswers % 50 === 0) {
      if (typeof window !== 'undefined' && window.checkAndAwardStamp) {
        window.checkAndAwardStamp(() => {
          if (quizQuestions !== null) {
            currentQuizIndex++;
            if (currentQuizIndex >= quizQuestions.length) { endQuiz(true); return; }
          }
          nextQuizQuestion(true);
        });
        return; // Callbackが呼ばれるまで待機
      }
    }

    if (quizQuestions !== null) {
      currentQuizIndex++;
      if (currentQuizIndex >= quizQuestions.length) { endQuiz(true); return; }
    }

    nextQuizQuestion(true);
  } else {
    if (isCorrect && !isReadingCorrect) {
      playSound('error.wav');
      // ★ メッセージ変更
      showMessage('もじはあっているよ！<br>でも、このことばのときは<br>「は」や「へ」のよみかたがかわるよ。<br>もじをタップして<br>よみかたをかえてみよう！');

      // 文字入力のロックを解除し、間違ったセルの記録も消す
      wrongAnswerCells.clear();
      window.CANVAS_ENGINE.renderBoard(getAppState());
      isQuizPlaying = false;
      return;
    }

    if (playMode === 'name' && currentQuizMode !== 3 && lastCellChar) {
      wrongAnswerCells.add(lastCellChar);
    } else {
      for (let token of quizInputTokens) {
        if (!cleanTargetStr.includes(token)) {
          if (token === 'っ' || token === 'ー') {
            wrongAnswerCells.add('っ ー');
          } else {
            wrongAnswerCells.add(token);
          }
        }
      }
    }
    window.CANVAS_ENGINE.renderBoard(getAppState());

    quizRetryCount++;
    const config = quizConfig[`q${currentQuizMode}`];

    if (config.retry !== 0 && quizRetryCount >= config.retry) {
      if (quizQuestions !== null) {
        currentQuizIndex++;
        if (currentQuizIndex >= quizQuestions.length) { endQuiz(true); return; }
      }
      nextQuizQuestion(true, true);
    } else {
      if (!(isCorrect && !isReadingCorrect)) {
        setBearMouth(true);
        await playAudioPromise(seBuffers.get('q_incorrect.mp3'), audioVolume);
        setBearMouth(false);
        await new Promise(r => setTimeout(r, 300));
      }

      quizInputTokens = [];
      updateAnalyzedData(true);
      updateTextDisplay();
      checkAndSwitchBoard();

      // ★ 再生前にヒントを消す
      quizHintActive = false;
      if (quizHintTimeout) clearTimeout(quizHintTimeout);
      window.CANVAS_ENGINE.renderBoard(getAppState());

      if (currentQuizMode === 3) {
        await playStringSequence(currentTargetString, currentTargetForcedReadings);
      } else {
        const buf = getAudioBufferForNode(currentTargetString);
        if (buf) await playAudioPromise(buf, audioVolume);
      }

      // 再生終了の0.5秒後に表示
      quizHintTimeout = setTimeout(() => {
        quizHintActive = true;
        window.CANVAS_ENGINE.renderBoard(getAppState());
      }, 500);

      isQuizPlaying = false;
    }
  }
};

const handleQuizAnswer = async (cell) => {
  if (cell.char === '、 。') return;
  if (wrongAnswerCells.has(cell.char)) return;

  isQuizPlaying = true;

  let inputtedStr = "";
  let answerSoundTarget = "";

  if (cell.char === 'っ ー') {
    const lastToken = quizInputTokens.length > 0 ? quizInputTokens[quizInputTokens.length - 1] : '';
    if (lastToken === 'っ') {
      quizInputTokens[quizInputTokens.length - 1] = 'ー';
      answerSoundTarget = 'ー';
    } else if (lastToken === 'ー') {
      quizInputTokens[quizInputTokens.length - 1] = 'っ';
      answerSoundTarget = 'っ';
    } else {
      quizInputTokens.push('っ');
      answerSoundTarget = 'っ';
    }
    inputtedStr = quizInputTokens.join('');
  } else if (playMode === 'name' && cell.word && currentQuizMode !== 3) {
    quizInputTokens = [cell.word];
    inputtedStr = cell.word;
    answerSoundTarget = cell.word;
  } else {
    quizInputTokens.push(cell.char);
    inputtedStr = quizInputTokens.join('');
    answerSoundTarget = cell.char;
  }

  updateAnalyzedData(true); // ★追加
  updateTextDisplay();

  // ★ 追加: ① 正解をクリックした「直後」に、絶対にヒント枠を画面から消す。
  // 音声（cell.charの音）が鳴る前にヒント枠を消去して画面に反映させる
  const cleanTargetStr = currentTargetString.replace(/[！!、。 　]/g, '');
  if (inputtedStr.length >= cleanTargetStr.length || inputtedStr === cleanTargetStr) {
    if (quizHintTimeout) {
      clearTimeout(quizHintTimeout);
      quizHintTimeout = null;
    }
    quizHintActive = false;
    window.CANVAS_ENGINE.renderBoard(getAppState());
  }

  if (cell.char === 'っ ー') {
    const lastToken = quizInputTokens.length > 0 ? quizInputTokens[quizInputTokens.length - 1] : '';
    answerSoundTarget = lastToken;
  } else {
    // ★変更: 読み上げ音声を解析済みのデータから取得
    const lastData = quizDisplayData[quizDisplayData.length - 1];
    answerSoundTarget = lastData ? lastData.reading : cell.char;
  }

  if (answerSoundTarget === 'っ') {
  } else if (answerSoundTarget === 'ー') {
    let prevChar = quizInputTokens.length > 1 ? quizInputTokens[quizInputTokens.length - 2] : null;
    if (prevChar) {
      const vowel = getVowel(prevChar[prevChar.length - 1]) || 'あ';
      const buf = getAudioBufferForNode(vowel);
      if (buf) {
        setBearMouth(true);
        await playAudioPromise(buf, audioVolume);
        setBearMouth(false);
      }
    }
  } else {
    const answerBuf = getAudioBufferForNode(answerSoundTarget);
    if (answerBuf) {
      setBearMouth(true);
      await playAudioPromise(answerBuf, audioVolume);
      setBearMouth(false);
    }
  }

  checkAndSwitchBoard();
  window.CANVAS_ENGINE.renderBoard(getAppState());

  // ★ 変更: 判定を submitQuizAnswer に委譲。もんだい3は自動判定せず「けってい」を待つ。
  if (currentQuizMode === 3) {
    isQuizPlaying = false;
  } else {
    if (inputtedStr.length >= currentTargetString.length || inputtedStr === currentTargetString) {
      await submitQuizAnswer(inputtedStr, cell.char);
    } else {
      isQuizPlaying = false;
    }
  }
};

const endQuiz = async (playEndSound = false) => {
  isQuizPlaying = true;
  if (playEndSound) {
    setBearMouth(true);
    await playAudioPromise(seBuffers.get('q_end.mp3'), audioVolume);
    setBearMouth(false);
  }
  currentQuizMode = null;
  isQuizPlaying = false;
  currentTargetString = "";
  currentTargetForcedReadings = {}; // ★追加

  wrongAnswerCells.clear();
  correctAnswerCell = null;
  window.CANVAS_ENGINE.renderBoard(getAppState());

  if (typeof updateTabUI === 'function') updateTabUI();
  if (typeof updateTextDisplay === 'function') updateTextDisplay();
};

const handleCellClick = (cell) => {
  console.log("handleCellClick called for:", cell.char, "isQuizPlaying =", isQuizPlaying);
  if (isQuizPlaying) {
    console.log("handleCellClick returned early because isQuizPlaying is true");
    return;
  }

  cancelSequence();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (currentQuizMode !== null) {
    handleQuizAnswer(cell);
    return;
  }

  if (isRecordMode) {
    if (cell.char === '、 。' || cell.char === 'っ ー') return;
    currentRecordTarget = cell;
    const display = document.getElementById('record-target-display');
    const targetText = (playMode === 'name' && cell.word) ? cell.word : cell.char;
    display.textContent = targetText; display.style.color = '#ef4444';
    display.style.fontSize = targetText.length > 3 ? '2.5cqw' : '3.5cqw';
    playSound('moji_namae.wav'); window.CANVAS_ENGINE.renderBoard(getAppState()); updateRecordButtons();
    return;
  }

  const checkSecretCommand = () => {
    if (playMode === 'char' && inputTokens.length >= 5) {
      const last5 = inputTokens.slice(-5).join('');
      // 「、」が最初に打たれるので「すたんぷ、」で反応するようにする
      if (last5 === 'すたんぷ、') {
        inputTokens = [];
        updateAnalyzedData(false);
        updateTextDisplay();
        playSound('seion.wav');
        try {
          if (typeof window !== 'undefined' && window.renderStampBook) window.renderStampBook();
        } catch (e) {
          console.error('renderStampBook error:', e);
        }

        // モーダルを強制的に最前面に出す
        const overlay = document.getElementById('stamp-book-modal');
        if (overlay) {
          overlay.style.zIndex = '9999';
          overlay.classList.remove('hidden');
          overlay.classList.add('flex');
        }
        return true;
      }
    }
    return false;
  };

  if (cell.char === '、 。') {
    const lastToken = inputTokens.length > 0 ? inputTokens[inputTokens.length - 1] : '';
    if (lastToken === '、') inputTokens[inputTokens.length - 1] = '。';
    else if (lastToken === '。') inputTokens[inputTokens.length - 1] = '、';
    else inputTokens.push('、');
    updateAnalyzedData(false); // ★追加
    updateTextDisplay();
    if (checkSecretCommand()) return;
    return;
  }

  if (cell.char === 'っ ー') {
    const lastToken = inputTokens.length > 0 ? inputTokens[inputTokens.length - 1] : '';
    if (lastToken === 'っ') inputTokens[inputTokens.length - 1] = 'ー';
    else if (lastToken === 'ー') inputTokens[inputTokens.length - 1] = 'っ';
    else inputTokens.push('っ');
    updateAnalyzedData(false); // ★追加
    updateTextDisplay(); return;
  }

  const textToAdd = (playMode === 'name' && cell.word) ? cell.word : cell.char;
  inputTokens.push(textToAdd);
  updateAnalyzedData(false); // ★追加
  updateTextDisplay();

  if (checkSecretCommand()) return;

  // ★変更: 読み上げ音声を解析済みのデータから取得
  const lastData = displayData[displayData.length - 1];
  const soundTarget = lastData ? lastData.reading : textToAdd;

  const buf = getAudioBufferForNode(soundTarget);
  if (buf) {
    const source = audioCtx.createBufferSource(); const gain = audioCtx.createGain();
    source.buffer = buf; gain.gain.value = audioVolume;
    source.connect(gain); gain.connect(audioCtx.destination);
    source.start(0); activeSourceNodes.push(source);
    setBearMouth(true); setTimeout(() => { if (!isSpeakingSequence) setBearMouth(false); }, buf.duration * 1000);
  }
};

// ★ 変更: クイズ中も消しゴムが機能し、ヒント位置などを巻き戻すように修正
const handleBackspace = () => {
  cancelSequence();
  if (currentQuizMode !== null) {
    if (quizInputTokens.length > 0) {
      quizInputTokens.pop(); // 1文字消す
      playSound('kesu.wav');
      updateAnalyzedData(true); // ★追加
      updateTextDisplay();
      checkAndSwitchBoard(); // ボードの自動切り替え判定をやり直す
      window.CANVAS_ENGINE.renderBoard(getAppState());         // ヒント枠を1つ前の状態に更新する (黒塗りは維持)
    }
  } else {
    if (inputTokens.length > 0) {
      inputTokens.pop();
      playSound('kesu.wav');
      updateAnalyzedData(false); // ★追加
      updateTextDisplay();
    }
  }
};

// ★ 変更: クイズ中も「ぜんぶけす」が機能するように修正
const handleClearAll = () => {
  cancelSequence();
  if (currentQuizMode !== null) {
    if (quizInputTokens.length === 0) return;
  } else {
    if (inputTokens.length === 0) return;
  }
  playSound('zenbukesuno.wav', 0.7);
  const modal = document.getElementById('confirm-modal'); modal.classList.remove('hidden'); modal.classList.add('flex');
};

// ★ 変更: クイズ中の全消去実行時の処理
const handleConfirmDelete = () => {
  playSound('kesu.wav');
  if (currentQuizMode !== null) {
    quizInputTokens = []; // 入力を全リセット
    updateAnalyzedData(true); // ★追加
    updateTextDisplay();
    checkAndSwitchBoard();
    window.CANVAS_ENGINE.renderBoard(getAppState()); // ヒント枠を最初の文字に更新する (黒塗りは維持)
  } else {
    inputTokens = [];
    updateAnalyzedData(false); // ★追加
    updateTextDisplay();
  }
  closeModal();
};

const handleCancelDelete = () => { playSound('cancel.wav'); closeModal(); };
const closeModal = () => { const modal = document.getElementById('confirm-modal'); modal.classList.add('hidden'); modal.classList.remove('flex'); };



// ★ 波形調整 (トリミング) のグローバル変数と関数
let trimTargetId = null;
let trimOriginalBuffer = null;
let trimStart = 0;
let trimEnd = 0;
let isDraggingMarker = null;
let trimPlaySource = null;
let trimPlayAnimFrame = null;

const trimCanvas = document.getElementById('trim-canvas');
const trimMarkerStart = document.getElementById('trim-marker-start');
const trimMarkerEnd = document.getElementById('trim-marker-end');
const trimOverlayLeft = document.getElementById('trim-overlay-left');
const trimOverlayRight = document.getElementById('trim-overlay-right');
const trimStartTimeDisplay = document.getElementById('trim-start-time');
const trimEndTimeDisplay = document.getElementById('trim-end-time');
const trimContainer = document.getElementById('trim-waveform-container');
const trimLocator = document.getElementById('trim-play-locator');


function updateTrimUI() {
  if (!trimOriginalBuffer) return;
  const duration = trimOriginalBuffer.duration;

  trimStart = Math.max(0, Math.min(trimStart, trimEnd - 0.05));
  trimEnd = Math.max(trimStart + 0.05, Math.min(trimEnd, duration));

  trimStartTimeDisplay.textContent = trimStart.toFixed(2);
  trimEndTimeDisplay.textContent = trimEnd.toFixed(2);

  const startPercent = (trimStart / duration) * 100;
  const endPercent = (trimEnd / duration) * 100;

  trimMarkerStart.style.left = `${startPercent}%`;
  trimMarkerEnd.style.left = `${endPercent}%`;
  trimOverlayLeft.style.width = `${startPercent}%`;
  trimOverlayRight.style.left = `${endPercent}%`;
  trimOverlayRight.style.width = `${100 - endPercent}%`;
}

const getClientX = (e) => e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;

const handleTrimDragStart = (e, type) => { e.preventDefault(); isDraggingMarker = type; };
const handleTrimDragMove = (e) => {
  if (!isDraggingMarker || !trimOriginalBuffer) return;
  const rect = trimContainer.getBoundingClientRect();
  let x = getClientX(e) - rect.left;
  x = Math.max(0, Math.min(x, rect.width));
  const time = (x / rect.width) * trimOriginalBuffer.duration;
  if (isDraggingMarker === 'start') trimStart = time; else trimEnd = time;
  updateTrimUI();
};
const handleTrimDragEnd = () => { isDraggingMarker = null; };

const changeTrimVolume = (multiplier) => {
  if (!trimOriginalBuffer) return;
  const channels = trimOriginalBuffer.numberOfChannels;
  const length = trimOriginalBuffer.length;
  for (let i = 0; i < channels; i++) {
    const channelData = trimOriginalBuffer.getChannelData(i);
    for (let j = 0; j < length; j++) {
      channelData[j] = Math.max(-1.0, Math.min(1.0, channelData[j] * multiplier));
    }
  }
  window.CANVAS_ENGINE.drawWaveform(trimOriginalBuffer, trimCanvas, trimContainer);
  playSound('cancel.wav', 0.2);
};

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('contextmenu', e => e.preventDefault(), { passive: false });
  document.addEventListener('dragstart', e => e.preventDefault(), { passive: false });

  // ★修正: グローバル関数の代わりにイベントデリゲーションを使用して手動ルビ切り替えを実行
  document.addEventListener('click', (e) => {
    const toggleSpan = e.target.closest('.ha-he-toggle');
    if (toggleSpan) {
      const index = parseInt(toggleSpan.getAttribute('data-index'), 10);
      const isQuiz = toggleSpan.getAttribute('data-is-quiz') === 'true';

      const targetData = isQuiz ? quizDisplayData : displayData;
      const data = targetData[index];
      if (data && data.isHaHe) {
        if (data.token === 'は') data.reading = data.reading === 'は' ? 'わ' : 'は';
        else if (data.token === 'へ') data.reading = data.reading === 'へ' ? 'え' : 'へ';
        data.isManual = true;
        updateTextDisplay();
        const buf = getAudioBufferForNode(data.reading);
        if (buf) {
          const source = audioCtx.createBufferSource(); const gain = audioCtx.createGain();
          source.buffer = buf; gain.gain.value = audioVolume;
          source.connect(gain); gain.connect(audioCtx.destination); source.start(0);
        }
      }
    }
  });

  let touchStartX = 0; let touchStartY = 0;
  document.addEventListener('touchstart', e => {
    if (e.touches && e.touches.length === 1) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const isScrollable = e.target.closest('#text-container-ref') ||
      e.target.closest('#settings-modal-content') ||
      e.target.closest('#quiz-settings-modal-content') ||
      e.target.tagName.toLowerCase() === 'input' ||
      e.target.closest('.trim-allow-drag');
    if (e.touches && e.touches.length > 1) { e.preventDefault(); }
    else if (!isScrollable) {
      if (e.touches && e.touches.length === 1) {
        const diffX = Math.abs(e.touches[0].clientX - touchStartX);
        const diffY = Math.abs(e.touches[0].clientY - touchStartY);
        if (diffX > 15 || diffY > 15) e.preventDefault();
      } else { e.preventDefault(); }
    }
  }, { passive: false });

  trimMarkerStart.addEventListener('mousedown', (e) => handleTrimDragStart(e, 'start'));
  trimMarkerStart.addEventListener('touchstart', (e) => handleTrimDragStart(e, 'start'), { passive: false });
  trimMarkerEnd.addEventListener('mousedown', (e) => handleTrimDragStart(e, 'end'));
  trimMarkerEnd.addEventListener('touchstart', (e) => handleTrimDragStart(e, 'end'), { passive: false });
  window.addEventListener('mousemove', handleTrimDragMove);
  window.addEventListener('touchmove', handleTrimDragMove, { passive: false });
  window.addEventListener('mouseup', handleTrimDragEnd);
  window.addEventListener('touchend', handleTrimDragEnd);

  document.getElementById('btn-trim-start-minus').addEventListener('click', () => { trimStart -= 0.01; playSound('cancel.wav', 0.2); updateTrimUI(); });
  document.getElementById('btn-trim-start-plus').addEventListener('click', () => { trimStart += 0.01; playSound('cancel.wav', 0.2); updateTrimUI(); });
  document.getElementById('btn-trim-end-minus').addEventListener('click', () => { trimEnd -= 0.01; playSound('cancel.wav', 0.2); updateTrimUI(); });
  document.getElementById('btn-trim-end-plus').addEventListener('click', () => { trimEnd += 0.01; playSound('cancel.wav', 0.2); updateTrimUI(); });
  document.getElementById('btn-trim-vol-down').addEventListener('click', () => changeTrimVolume(0.8));
  document.getElementById('btn-trim-vol-up').addEventListener('click', () => changeTrimVolume(1.2));

  document.getElementById('btn-trim-close').addEventListener('click', () => {
    playSound('cancel.wav');
    if (trimPlaySource) { try { trimPlaySource.stop(); } catch (e) { } }
    cancelAnimationFrame(trimPlayAnimFrame);
    trimLocator.classList.add('hidden');
    document.getElementById('trim-modal').classList.add('hidden'); document.getElementById('trim-modal').classList.remove('flex');
  });

  document.getElementById('btn-trim-play').addEventListener('click', () => {
    if (!trimOriginalBuffer) return;
    if (trimPlaySource) { try { trimPlaySource.stop(); } catch (e) { } }
    cancelAnimationFrame(trimPlayAnimFrame);

    const slicedBuffer = sliceAudioBuffer(trimOriginalBuffer, trimStart, trimEnd);
    trimPlaySource = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    trimPlaySource.buffer = slicedBuffer; gain.gain.value = audioVolume;
    trimPlaySource.connect(gain); gain.connect(audioCtx.destination);
    trimPlaySource.start(0);

    const playStartTime = audioCtx.currentTime;
    const totalDuration = trimOriginalBuffer.duration;
    trimLocator.classList.remove('hidden');

    const updateLocator = () => {
      const elapsed = audioCtx.currentTime - playStartTime;
      const currentPlayTime = trimStart + elapsed;

      if (currentPlayTime >= trimEnd) {
        trimLocator.classList.add('hidden');
        return;
      }

      const percent = (currentPlayTime / totalDuration) * 100;
      trimLocator.style.left = `${percent}%`;
      trimPlayAnimFrame = requestAnimationFrame(updateLocator);
    };

    updateLocator();

    trimPlaySource.onended = () => {
      trimLocator.classList.add('hidden');
      cancelAnimationFrame(trimPlayAnimFrame);
    };
  });

  document.getElementById('btn-trim-save').addEventListener('click', async () => {
    if (!trimOriginalBuffer || !trimTargetId) return;
    playSound('cancel.wav');
    if (trimPlaySource) { try { trimPlaySource.stop(); } catch (e) { } }
    cancelAnimationFrame(trimPlayAnimFrame);
    trimLocator.classList.add('hidden');

    const slicedBuffer = sliceAudioBuffer(trimOriginalBuffer, trimStart, trimEnd);
    const arrayBuffer = audioBufferToWav(slicedBuffer);
    const targetType = playMode === 'name' ? 'name' : 'char';

    showProcessing('保存しています...');
    try {
      await saveDataToDB(trimTargetId, targetType, arrayBuffer, 'record', 'audio/wav');
      await loadAudioDataFromDB();
      window.CANVAS_ENGINE.renderBoard(getAppState()); updateRecordButtons();
      document.getElementById('trim-modal').classList.add('hidden'); document.getElementById('trim-modal').classList.remove('flex');
      hideProcessing();
    } catch (err) {
      console.error("Trim Save Error", err); hideProcessing(); showMessage("保存に失敗しました");
    }
  });

  const sM = document.getElementById('settings-modal'), cM = document.getElementById('confirm-modal'), tS = document.getElementById('title-screen'), sA = document.getElementById('start-btn-container'), lS = document.getElementById('loading-spinner');

  document.getElementById('btn-app-start').addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    createKeepAlive(); playSound('seion.wav');
    tS.style.opacity = "0"; setTimeout(() => tS.style.display = "none", 700);
  });

  document.getElementById('btn-seion').addEventListener('click', () => { if (boardType !== 'seion') { boardType = 'seion'; playSound('seion.wav'); window.CANVAS_ENGINE.renderBoard(getAppState()); updateButtons(); } });
  document.getElementById('btn-dakuon').addEventListener('click', () => { if (boardType !== 'dakuon') { boardType = 'dakuon'; playSound('dakuon.wav'); if (playMode === 'name') playMode = 'char'; window.CANVAS_ENGINE.renderBoard(getAppState()); updateButtons(); } });

  document.getElementById('btn-char').addEventListener('click', () => {
    if (currentQuizMode === 2 && quizConfig.q2.lock) { playSound('error.wav'); return; }

    if (playMode !== 'char') {
      playMode = 'char'; playSound('moji_namae.wav');
      if (isRecordMode) { currentRecordTarget = null; document.getElementById('record-target-display').textContent = '未選択'; document.getElementById('record-target-display').style.color = '#9ca3af'; updateRecordButtons(); }
      window.CANVAS_ENGINE.renderBoard(getAppState()); updateButtons();
    }
  });

  document.getElementById('btn-name').addEventListener('click', () => {
    if (boardType === 'dakuon') { playSound('error.wav'); return; }
    if (currentQuizMode === 1 && quizConfig.q1.lock) { playSound('error.wav'); return; }

    if (playMode !== 'name') {
      playMode = 'name'; playSound('moji_namae.wav');
      if (isRecordMode) { currentRecordTarget = null; document.getElementById('record-target-display').textContent = '未選択'; document.getElementById('record-target-display').style.color = '#9ca3af'; updateRecordButtons(); }
      window.CANVAS_ENGINE.renderBoard(getAppState()); updateButtons();
    }
  });

  document.getElementById('btn-backspace').addEventListener('click', handleBackspace);
  document.getElementById('btn-clear-all').addEventListener('click', handleClearAll);
  document.getElementById('modal-btn-delete').addEventListener('click', handleConfirmDelete);
  document.getElementById('modal-btn-cancel').addEventListener('click', handleCancelDelete);

  const settingsModal = document.getElementById('settings-modal'); const settingsClose = document.getElementById('settings-close');
  const speedSlider = document.getElementById('speed-slider'); const speedDisplay = document.getElementById('speed-display');
  const audioVolumeSlider = document.getElementById('audio-volume-slider'); const audioVolumeDisplay = document.getElementById('audio-volume-display');
  const seVolumeSlider = document.getElementById('se-volume-slider'); const seVolumeDisplay = document.getElementById('se-volume-display');

  const openSettings = () => { playSound('cancel.wav'); settingsModal.classList.remove('hidden'); settingsModal.classList.add('flex'); };
  let leftGearPressed = false; let rightGearPressed = false;
  const checkGearTrigger = () => { if (leftGearPressed && rightGearPressed) { openSettings(); leftGearPressed = false; rightGearPressed = false; } };
  const btnSettingsLeft = document.getElementById('btn-settings-left'); const btnSettingsRight = document.getElementById('btn-settings-right');

  if (btnSettingsLeft && btnSettingsRight) {
    btnSettingsLeft.addEventListener('touchstart', (e) => { e.preventDefault(); leftGearPressed = true; checkGearTrigger(); });
    btnSettingsLeft.addEventListener('touchend', () => { leftGearPressed = false; }); btnSettingsLeft.addEventListener('touchcancel', () => { leftGearPressed = false; });
    btnSettingsRight.addEventListener('touchstart', (e) => { e.preventDefault(); rightGearPressed = true; checkGearTrigger(); });
    btnSettingsRight.addEventListener('touchend', () => { rightGearPressed = false; }); btnSettingsRight.addEventListener('touchcancel', () => { rightGearPressed = false; });
    btnSettingsLeft.addEventListener('mousedown', () => { leftGearPressed = true; checkGearTrigger(); });
    window.addEventListener('mouseup', () => { leftGearPressed = false; rightGearPressed = false; });
    btnSettingsRight.addEventListener('mousedown', () => { rightGearPressed = true; checkGearTrigger(); });
  }
  document.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); openSettings(); } });
  settingsClose.addEventListener('click', () => {
    playSound('cancel.wav');
    saveConfigFromUI();
    updateAnalyzedData(currentQuizMode !== null);
    updateTextDisplay();
    settingsModal.classList.add('hidden'); settingsModal.classList.remove('flex');
  });

  const updateVolumeLabel = (val, displayElement) => {
    let labelText = `${val * 10}%`; if (val === 10) labelText += ' (最大)'; else if (val === 7) labelText += ' (初期値)'; else if (val === 0) labelText += ' (無音)';
    displayElement.textContent = labelText;
  };

  audioVolumeSlider.addEventListener('input', (e) => { const val = parseInt(e.target.value); audioVolume = val / 10; updateVolumeLabel(val, audioVolumeDisplay); if (!isSpeakingSequence) playSound('seion.wav', audioVolume); });
  seVolumeSlider.addEventListener('input', (e) => { const val = parseInt(e.target.value); seVolume = val / 10; updateVolumeLabel(val, seVolumeDisplay); if (!isSpeakingSequence) playSound('seion.wav', 0.5); });
  speedSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value); playbackDelay = val; let labelText = '';
    if (val === 100) labelText = '0.1秒 (初期値)'; else if (val === -200) labelText = '重なる速さ (超高速)'; else if (val === 500) labelText = '0.5秒 (超低速)';
    else if (val === 0) labelText = '0秒 (間髪入れず)'; else if (val < 0) labelText = `食い気味 (${val / 1000}秒)`; else labelText = `${(val / 1000).toString()}秒`;
    speedDisplay.textContent = labelText;
  });

  const btnCountdownNone = document.getElementById('btn-countdown-none'); const btnCountdown3sec = document.getElementById('btn-countdown-3sec');
  const updateCountdownButtons = () => {
    const activeClass = 'flex-1 py-[0.8cqw] rounded-[0.5cqw] font-bold text-[1.2cqw] transition-colors bg-blue-500 text-white shadow-sm border-b-[0.2cqw] border-blue-700';
    const inactiveClass = 'flex-1 py-[0.8cqw] rounded-[0.5cqw] font-bold text-[1.2cqw] transition-colors bg-gray-200 text-gray-600 hover:bg-gray-300';
    if (countdownSetting === 'none') { btnCountdownNone.className = activeClass; btnCountdown3sec.className = inactiveClass; }
    else { btnCountdownNone.className = inactiveClass; btnCountdown3sec.className = activeClass; }
  };
  btnCountdownNone.addEventListener('click', () => { playSound('cancel.wav'); countdownSetting = 'none'; updateCountdownButtons(); });
  btnCountdown3sec.addEventListener('click', () => { playSound('cancel.wav'); countdownSetting = '3sec'; updateCountdownButtons(); });

  const btnEnterRecordMode = document.getElementById('btn-enter-record-mode'); const btnRecordExit = document.getElementById('btn-record-exit');
  const normalUi = document.getElementById('normal-mode-ui'); const recordUi = document.getElementById('record-mode-ui');
  const btnRecordStart = document.getElementById('btn-record-start'); const btnRecordClear = document.getElementById('btn-record-clear');
  const btnRecordImport = document.getElementById('btn-record-import'); const recordFileInput = document.getElementById('record-file-input');

  try {
    const savedConfig = localStorage.getItem('hiragana_quiz_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      quizConfig.showTabs = parsed.showTabs ?? true;
      quizConfig.autoParticleConversion = parsed.autoParticleConversion ?? false; // ★追加
      quizConfig.q1 = { ...quizConfig.q1, ...parsed.q1 };
      quizConfig.q2 = { ...quizConfig.q2, ...parsed.q2 };
      quizConfig.q3 = { ...quizConfig.q3, ...parsed.q3 };
    }
  } catch (e) { console.warn('設定の読み込みに失敗しました', e); }

  // ★録音設定の初期化
  let recordingConfig = {
    autoTrimRecord: true,
    autoNoiseRecord: true,
    autoTrimImport: true,
    autoNoiseImport: true
  };
  try {
    const savedRecConfig = localStorage.getItem('hiragana_recording_config');
    if (savedRecConfig) recordingConfig = { ...recordingConfig, ...JSON.parse(savedRecConfig) };
  } catch (e) { }

  const saveRecordingConfig = () => {
    localStorage.setItem('hiragana_recording_config', JSON.stringify(recordingConfig));
  };

  const updateRecordingSettingsUI = () => {
    const chkTrimRec = document.getElementById('chk-trim-record');
    const chkNoiseRec = document.getElementById('chk-noise-record');
    const chkTrimImp = document.getElementById('chk-trim-import');
    const chkNoiseImp = document.getElementById('chk-noise-import');
    if (chkTrimRec) chkTrimRec.checked = recordingConfig.autoTrimRecord;
    if (chkNoiseRec) chkNoiseRec.checked = recordingConfig.autoNoiseRecord;
    if (chkTrimImp) chkTrimImp.checked = recordingConfig.autoTrimImport;
    if (chkNoiseImp) chkNoiseImp.checked = recordingConfig.autoNoiseImport;
  };
  updateRecordingSettingsUI();

  ['chk-trim-record', 'chk-noise-record', 'chk-trim-import', 'chk-noise-import'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        const key = e.target.id.replace('chk-', '').split('-').map((v, i) => i === 0 ? v : v.charAt(0).toUpperCase() + v.slice(1)).join('');
        // キー変換: trim-record -> trimRecord -> autoTrimRecord
        const configKey = 'auto' + key.charAt(0).toUpperCase() + key.slice(1);
        recordingConfig[configKey] = e.target.checked;
        saveRecordingConfig();
      });
    }
  });

  const applyConfigToUI = () => {
    document.querySelector(`input[name="show-tabs"][value="${quizConfig.showTabs}"]`).checked = true;
    document.querySelector(`input[name="auto-particle-conversion"][value="${quizConfig.autoParticleConversion}"]`).checked = true;

    document.querySelector(`input[name="q1-type"][value="${quizConfig.q1.type}"]`).checked = true;
    document.getElementById('q1-list').value = quizConfig.q1.list;
    document.querySelector(`input[name="q1-retry"][value="${quizConfig.q1.retry}"]`).checked = true;
    document.querySelector(`input[name="q1-lock"][value="${quizConfig.q1.lock}"]`).checked = true;
    document.querySelector(`input[name="q1-hint"][value="${quizConfig.q1.hint || 'none'}"]`).checked = true;

    document.querySelector(`input[name="q2-type"][value="${quizConfig.q2.type}"]`).checked = true;
    document.getElementById('q2-list').value = quizConfig.q2.list;
    document.querySelector(`input[name="q2-retry"][value="${quizConfig.q2.retry}"]`).checked = true;
    document.querySelector(`input[name="q2-lock"][value="${quizConfig.q2.lock}"]`).checked = true;
    document.querySelector(`input[name="q2-hint"][value="${quizConfig.q2.hint || 'none'}"]`).checked = true;

    document.querySelector(`input[name="q3-type"][value="${quizConfig.q3.type}"]`).checked = true;
    document.getElementById('q3-list').value = quizConfig.q3.list;
    document.querySelector(`input[name="q3-retry"][value="${quizConfig.q3.retry}"]`).checked = true;
    document.querySelector(`input[name="q3-hint"][value="${quizConfig.q3.hint || 'none'}"]`).checked = true;
  };

  const saveConfigFromUI = () => {
    quizConfig.showTabs = document.querySelector('input[name="show-tabs"]:checked').value === 'true';
    quizConfig.autoParticleConversion = document.querySelector('input[name="auto-particle-conversion"]:checked').value === 'true';

    quizConfig.q1.type = document.querySelector('input[name="q1-type"]:checked').value;
    quizConfig.q1.list = document.getElementById('q1-list').value;
    quizConfig.q1.retry = parseInt(document.querySelector('input[name="q1-retry"]:checked').value);
    quizConfig.q1.lock = document.querySelector('input[name="q1-lock"]:checked').value === 'true';
    quizConfig.q1.hint = document.querySelector('input[name="q1-hint"]:checked').value;

    quizConfig.q2.type = document.querySelector('input[name="q2-type"]:checked').value;
    quizConfig.q2.list = document.getElementById('q2-list').value;
    quizConfig.q2.retry = parseInt(document.querySelector('input[name="q2-retry"]:checked').value);
    quizConfig.q2.lock = document.querySelector('input[name="q2-lock"]:checked').value === 'true';
    quizConfig.q2.hint = document.querySelector('input[name="q2-hint"]:checked').value;

    quizConfig.q3.type = document.querySelector('input[name="q3-type"]:checked').value;
    quizConfig.q3.list = document.getElementById('q3-list').value;
    quizConfig.q3.retry = parseInt(document.querySelector('input[name="q3-retry"]:checked').value);
    quizConfig.q3.hint = document.querySelector('input[name="q3-hint"]:checked').value;

    localStorage.setItem('hiragana_quiz_config', JSON.stringify(quizConfig));
  };

  // ★ 変更: バリデーション時に「！」を無視するように修正
  const validateQuizSettings = () => {
    let errors = [];

    const validChars = getAllChars();
    const validWords = getAllWords();
    const playableChars = validChars.filter(c => c !== '、 。' && c !== 'っ ー');

    const q1Input = document.getElementById('q1-list').value;
    if (q1Input.trim() !== '') {
      const q1List = parseQuizList(q1Input);
      const invalidQ1 = q1List.filter(item => !playableChars.includes(item.text));
      if (invalidQ1.length > 0) {
        errors.push(`【もんだい①】 出題できない文字が含まれています: 「${invalidQ1.map(i => i.original).join('」「')}」<br><span style="font-size:1.5cqw; color:#6b7280;">※もんだい①はボードにある1文字のひらがなのみ入力してください。</span>`);
      }
    }

    const q2Input = document.getElementById('q2-list').value;
    if (q2Input.trim() !== '') {
      const q2List = parseQuizList(q2Input);
      const invalidQ2 = q2List.filter(item => !validWords.includes(item.text));
      if (invalidQ2.length > 0) {
        errors.push(`【もんだい②】 出題できない名前が含まれています: 「${invalidQ2.map(i => i.original).join('」「')}」<br><span style="font-size:1.5cqw; color:#6b7280;">※もんだい②は絵のボタンが存在する名前のみ入力してください。</span>`);
      }
    }

    // ★ 変更: もんだい3のチェックを緩和 (文字の組み合わせならOK)
    const q3Input = document.getElementById('q3-list').value;
    if (q3Input.trim() !== '') {
      const q3List = parseQuizList(q3Input);
      const allValidTokens = [...playableChars, 'っ', 'ー'];

      const isValidString = (str) => {
        let i = 0;
        while (i < str.length) {
          let matched = false;
          if (i + 1 < str.length) {
            const twoChars = str.substring(i, i + 2);
            if (allValidTokens.includes(twoChars)) { matched = true; i += 2; continue; }
          }
          const oneChar = str.substring(i, i + 1);
          if (allValidTokens.includes(oneChar)) { matched = true; i += 1; continue; }
          if (!matched) return false;
        }
        return true;
      };

      const invalidQ3 = q3List.filter(item => !isValidString(item.text));
      if (invalidQ3.length > 0) {
        errors.push(`【もんだい③】 出題できない文字が含まれています: 「${invalidQ3.map(i => i.original).join('」「')}」<br><span style="font-size:1.5cqw; color:#6b7280;">※発音できない記号や漢字が含まれていないか確認してください。</span>`);
      }
    }

    return errors;
  };

  const qsModal = document.getElementById('quiz-settings-modal');
  const qsModalContent = document.getElementById('quiz-settings-modal-content');

  document.getElementById('btn-open-quiz-settings').addEventListener('click', () => {
    playSound('cancel.wav');
    settingsModal.classList.add('hidden'); settingsModal.classList.remove('flex');
    applyConfigToUI();

    qsModalContent.style.transform = 'translate(0px, 0px)';
    quizModalCurrentX = 0;
    quizModalCurrentY = 0;

    qsModal.classList.remove('hidden'); qsModal.classList.add('flex');
  });

  document.getElementById('quiz-settings-close').addEventListener('click', () => {
    const errors = validateQuizSettings();
    if (errors.length > 0) {
      playSound('error.wav');
      showMessage(`<div style="text-align: left;">${errors.join('<br><br>')}</div>`);
      return;
    }

    playSound('cancel.wav');
    saveConfigFromUI();
    updateTabUI();
    updateAnalyzedData(currentQuizMode !== null); // ★追加: 設定変更を反映
    updateTextDisplay(); // ★追加
    qsModal.classList.add('hidden'); qsModal.classList.remove('flex');
  });

  document.getElementById('btn-tab-q1').addEventListener('click', () => { playSound('cancel.wav'); if (currentQuizMode === 1) endQuiz(false); else startQuiz(1); });
  document.getElementById('btn-tab-q2').addEventListener('click', () => { playSound('cancel.wav'); if (currentQuizMode === 2) endQuiz(false); else startQuiz(2); });
  document.getElementById('btn-tab-q3').addEventListener('click', () => { playSound('cancel.wav'); if (currentQuizMode === 3) endQuiz(false); else startQuiz(3); });

  const btnQ3Play = document.getElementById('btn-q3-play');
  if (btnQ3Play) {
    btnQ3Play.addEventListener('click', async () => {
      if ((currentQuizMode !== 3 && currentQuizMode !== 2) || isQuizPlaying || quizInputTokens.length === 0) return;
      playSound('cancel.wav', 0.5);
      isQuizPlaying = true;
      // ★ 修正: そのままの文字(quizInputTokens)ではなく、解析された読み方(reading)の配列を渡して再生する
      const tokensToPlay = quizDisplayData.map(d => d.reading);
      await playTokensSequence(tokensToPlay);
      isQuizPlaying = false;
    });
  }

  const btnQ3Submit = document.getElementById('btn-q3-submit');
  if (btnQ3Submit) {
    btnQ3Submit.addEventListener('click', async () => {
      if (currentQuizMode !== 3 || isQuizPlaying) return;
      playSound('cancel.wav', 0.5);
      isQuizPlaying = true;
      const inputtedStr = quizInputTokens.join('');
      await submitQuizAnswer(inputtedStr, null); // 手動判定なのでセル指定なし
    });
  }

  document.getElementById('btn-quiz-repeat').addEventListener('click', async () => {
    if (currentQuizMode === null || isQuizPlaying || !currentTargetString) return;
    isQuizPlaying = true;

    // ★ 再生前にヒントを消す
    quizHintActive = false;
    if (quizHintTimeout) clearTimeout(quizHintTimeout);
    window.CANVAS_ENGINE.renderBoard(getAppState());

    if (currentQuizMode === 3) {
      await playStringSequence(currentTargetString, currentTargetForcedReadings);
    } else {
      const buf = getAudioBufferForNode(currentTargetString);
      if (buf) await playAudioPromise(buf, audioVolume);
    }

    // 再生終了の0.5秒後にヒントを表示
    quizHintTimeout = setTimeout(() => {
      quizHintActive = true;
      window.CANVAS_ENGINE.renderBoard(getAppState());
    }, 500);

    isQuizPlaying = false;
  });

  btnEnterRecordMode.addEventListener('click', () => {
    playSound('cancel.wav'); settingsModal.classList.add('hidden'); settingsModal.classList.remove('flex');
    isRecordMode = true; currentRecordTarget = null;
    document.getElementById('record-target-display').textContent = '未選択'; document.getElementById('record-target-display').style.color = '#9ca3af';
    normalUi.style.display = 'none'; recordUi.style.display = 'flex'; window.CANVAS_ENGINE.renderBoard(getAppState());
  });

  btnRecordExit.addEventListener('click', () => {
    playSound('cancel.wav');
    if (isRecording) {
      mediaRecorder.stop(); isRecording = false;
      btnRecordStart.innerHTML = `<span style="font-size: 2cqw; line-height: 1;">⏺</span>録音`;
      btnRecordStart.classList.remove('bg-red-700', 'animate-pulse'); btnRecordStart.classList.add('bg-red-500'); btnRecordStart.classList.replace('border-red-900', 'border-red-700');
    }
    isRecordMode = false; currentRecordTarget = null; recordUi.style.display = 'none'; normalUi.style.display = 'flex'; window.CANVAS_ENGINE.renderBoard(getAppState());
  });

  const btnBackupExport = document.getElementById('btn-backup-export'); const btnBackupImportTrigger = document.getElementById('btn-backup-import-trigger');
  const backupFileInput = document.getElementById('backup-file-input'); const processingOverlay = document.getElementById('processing-overlay');
  const processingText = document.getElementById('processing-text'); const restoreConfirmModal = document.getElementById('restore-confirm-modal');
  const showProcessing = (text) => { processingText.innerHTML = text; processingOverlay.classList.remove('hidden'); processingOverlay.classList.add('flex'); };
  const hideProcessing = () => { processingOverlay.classList.add('hidden'); processingOverlay.classList.remove('flex'); };
  const messageModal = document.getElementById('message-modal');
  document.getElementById('modal-btn-message-ok').addEventListener('click', () => {
    playSound('seion.wav');
    messageModal.classList.add('hidden');
    messageModal.classList.remove('flex');
    if (currentQuizMode === 3) {
      isQuizPlaying = false;
      console.log("isQuizPlaying set to false by modal OK click");
    }
  });

  btnBackupExport.addEventListener('click', async () => {
    playSound('cancel.wav'); showProcessing('バックアップを作成中...');
    try { await new Promise(r => setTimeout(r, 100)); await exportBackup(); hideProcessing(); }
    catch (e) { console.error(e); hideProcessing(); showMessage('バックアップの作成に失敗しました。'); }
  });

  btnBackupImportTrigger.addEventListener('click', () => { playSound('cancel.wav'); backupFileInput.click(); });
  let pendingRestoreFile = null;
  backupFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return; pendingRestoreFile = file;
    settingsModal.classList.add('hidden'); settingsModal.classList.remove('flex');
    restoreConfirmModal.classList.remove('hidden'); restoreConfirmModal.classList.add('flex');
  });

  document.getElementById('modal-btn-restore-cancel').addEventListener('click', () => {
    playSound('cancel.wav'); backupFileInput.value = ''; pendingRestoreFile = null;
    restoreConfirmModal.classList.add('hidden'); restoreConfirmModal.classList.remove('flex');
    settingsModal.classList.remove('hidden'); settingsModal.classList.add('flex');
  });

  document.getElementById('modal-btn-restore-execute').addEventListener('click', async () => {
    playSound('cancel.wav'); restoreConfirmModal.classList.add('hidden'); restoreConfirmModal.classList.remove('flex');
    if (!pendingRestoreFile) return;
    showProcessing('データを復元しています...<br>そのままお待ちください');
    try {
      await new Promise(r => setTimeout(r, 100)); await importBackup(pendingRestoreFile);
      await loadAudioDataFromDB(); window.CANVAS_ENGINE.renderBoard(getAppState()); updateButtons(); updateTextDisplay();
      hideProcessing(); showMessage('復元が完了しました！');
    } catch (err) {
      console.error(err); hideProcessing(); showMessage('復元に失敗しました。<br>ファイルが壊れている可能性があります。');
    } finally { backupFileInput.value = ''; pendingRestoreFile = null; }
  });

  document.getElementById('bear-click-area').addEventListener('click', () => { if (isRecordMode) return; playSequence(); });

  btnRecordStart.addEventListener('click', async () => {
    if (!currentRecordTarget || isCountingDown) return;
    if (isRecording) {
      // ★ 修正: 録音停止の合図としてボタンを押した瞬間に音を鳴らす
      playSound('cancel.wav');
      mediaRecorder.stop(); isRecording = false;
      btnRecordStart.innerHTML = `<span style="font-size: 2cqw; line-height: 1;">⏺</span>録音`;
      btnRecordStart.classList.remove('bg-red-700', 'animate-pulse'); btnRecordStart.classList.add('bg-red-500'); btnRecordStart.classList.replace('border-red-900', 'border-red-700');
    } else {
      try {
        // ★ 修正: マイクを開く「前」にクリック音を鳴らしておく
        playSound('cancel.wav');

        // ★ 修正: iOSの余計なダッキング・マイク調整機能をすべて無効化する
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            autoGainControl: false,
            noiseSuppression: false
          }
        });

        const startRecording = () => {
          mediaRecorder = new MediaRecorder(stream); audioChunks = [];
          mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
          mediaRecorder.onstop = async () => {
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            let arrayBuffer = await audioBlob.arrayBuffer();
            let finalMimeType = mimeType;

            try {
              let processedBuf = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
              if (recordingConfig.autoNoiseRecord) processedBuf = await applyLowPassFilter(processedBuf);
              if (recordingConfig.autoTrimRecord) processedBuf = trimAudioBuffer(processedBuf);
              arrayBuffer = audioBufferToWav(processedBuf); finalMimeType = 'audio/wav';
            } catch (e) { console.error("Processing error", e); }

            const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;
            const targetType = playMode === 'name' && currentRecordTarget.word ? 'name' : 'char';

            recordedAudio.add(targetId); audioModePref.set(targetId, 'record');
            saveDataToDB(targetId, targetType, arrayBuffer, 'record', finalMimeType).then(() => {
              loadAudioDataFromDB().then(() => { window.CANVAS_ENGINE.renderBoard(getAppState()); updateRecordButtons(); });
            });

            // マイクのストリームを完全に停止
            stream.getTracks().forEach(track => track.stop());

            // ★ 修正: iOSでの致命的な音量低下バグ（通話モードから復帰しない）対策
            // マイク終了後、強制的に古いAudioContextを破壊し、新しいものを作り直す
            if (audioCtx) {
              await audioCtx.close();
            }
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // 音声データを新しいContext用にデコードし直す（配列データ自体はメモリ上にあるのでDL不要）
            await initAudioEngine();
          };

          mediaRecorder.start(); isRecording = true;
          btnRecordStart.innerHTML = `<span style="font-size: 2cqw; line-height: 1;">⏹</span>停止`;
          btnRecordStart.classList.remove('bg-red-500'); btnRecordStart.classList.add('bg-red-700', 'animate-pulse'); btnRecordStart.classList.replace('border-red-700', 'border-red-900');
        };

        if (countdownSetting === '3sec') {
          isCountingDown = true; const overlay = document.getElementById('countdown-overlay'); const textElem = document.getElementById('countdown-text');
          overlay.classList.remove('hidden'); overlay.classList.add('flex');
          let count = 3; textElem.textContent = count; playBeep(440);
          const timer = setInterval(() => {
            count--;
            if (count > 0) { textElem.textContent = count; playBeep(440); }
            else {
              clearInterval(timer); overlay.classList.add('hidden'); overlay.classList.remove('flex'); isCountingDown = false;
              // ★ 修正: 録音開始と被ってエコーキャンセラが誤作動するのを防ぐため、最後のビープ音を削除しました
              startRecording();
            }
          }, 1000);
        } else { startRecording(); }
      } catch (err) { alert("マイクへのアクセスを許可してください。"); }
    }
  });

  // 波形調整ボタンの呼び出し
  document.getElementById('btn-trim-open').addEventListener('click', () => {
    if (!currentRecordTarget) return;
    playSound('cancel.wav');
    const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;

    getAudioFromDB(targetId).then(recordData => {
      if (recordData && recordData.data) {
        audioCtx.decodeAudioData(recordData.data.slice(0)).then(buf => {
          trimTargetId = targetId; trimOriginalBuffer = buf;
          trimStart = 0; trimEnd = buf.duration;
          const modal = document.getElementById('trim-modal');
          modal.classList.remove('hidden'); modal.classList.add('flex');
          setTimeout(() => { window.CANVAS_ENGINE.drawWaveform(trimOriginalBuffer, trimCanvas, trimContainer); updateTrimUI(); }, 50); // モーダル描画待ち
        }).catch(e => console.error(e));
      }
    });
  });

  btnRecordImport.addEventListener('click', () => { if (!currentRecordTarget || isRecording) return; playSound('cancel.wav'); recordFileInput.click(); });
  recordFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file || !currentRecordTarget) return;
    playSound('cancel.wav'); showProcessing('ファイルを読み込み中...');
    try {
      const arrayBuffer = await file.arrayBuffer();
      let processedBuf = await audioCtx.decodeAudioData(arrayBuffer);
      if (recordingConfig.autoNoiseImport) processedBuf = await applyLowPassFilter(processedBuf);
      if (recordingConfig.autoTrimImport) processedBuf = trimAudioBuffer(processedBuf);
      const wavBuffer = audioBufferToWav(processedBuf);

      const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;
      const targetType = playMode === 'name' && currentRecordTarget.word ? 'name' : 'char';

      recordedAudio.add(targetId); audioModePref.set(targetId, 'record');
      await saveDataToDB(targetId, targetType, wavBuffer, 'record', 'audio/wav');
      await loadAudioDataFromDB();
      window.CANVAS_ENGINE.renderBoard(getAppState());
      updateRecordButtons();
      hideProcessing();
      showMessage('音声を取り込みました！');
    } catch (err) {
      console.error(err); hideProcessing(); showMessage('音声の読み込みに失敗しました。');
    } finally { recordFileInput.value = ''; }
  });

  document.getElementById('btn-record-play').addEventListener('click', async () => {
    if (!currentRecordTarget) return;
    const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;
    const buf = getAudioBufferForNode(targetId);
    if (buf) {
      const source = audioCtx.createBufferSource(); const gain = audioCtx.createGain();
      source.buffer = buf; gain.gain.value = audioVolume;
      source.connect(gain); gain.connect(audioCtx.destination); source.start(0);
    }
  });

  btnRecordClear.addEventListener('click', () => {
    if (!currentRecordTarget) return;
    const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;
    if (!recordedAudio.has(targetId)) return;
    playSound('kesu.wav'); recordedAudio.delete(targetId); audioModePref.set(targetId, 'sample');
    deleteFromDB(targetId).then(() => { window.CANVAS_ENGINE.renderBoard(getAppState()); updateRecordButtons(); });
  });

  const setAudioMode = (mode) => {
    if (!currentRecordTarget) return;
    const targetId = playMode === 'name' && currentRecordTarget.word ? currentRecordTarget.word : currentRecordTarget.char;
    const targetType = playMode === 'name' && currentRecordTarget.word ? 'name' : 'char';
    if (mode === 'record' && !recordedAudio.has(targetId)) return;
    playSound('cancel.wav'); audioModePref.set(targetId, mode);
    updateAudioModeInDB(targetId, targetType, mode).then(() => { window.CANVAS_ENGINE.renderBoard(getAppState()); updateRecordButtons(); });
  };

  document.getElementById('btn-audio-sample').addEventListener('click', () => setAudioMode('sample'));
  document.getElementById('btn-audio-record').addEventListener('click', () => setAudioMode('record'));

  // ★ 新規: 問題設定ウィンドウのドラッグ移動機能
  const dragHandle = document.getElementById('quiz-settings-drag-handle');
  let isDraggingQuizModal = false;
  let quizModalStartX = 0;
  let quizModalStartY = 0;
  let quizModalCurrentX = 0;
  let quizModalCurrentY = 0;

  const handleQuizModalDragStart = (e) => {
    if (e.target.tagName.toLowerCase() === 'button') return; // ボタンを押した場合は無視
    e.preventDefault();
    isDraggingQuizModal = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    quizModalStartX = clientX - quizModalCurrentX;
    quizModalStartY = clientY - quizModalCurrentY;
  };

  const handleQuizModalDragMove = (e) => {
    if (!isDraggingQuizModal) return;
    e.preventDefault(); // スクロール防止
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    quizModalCurrentX = clientX - quizModalStartX;
    quizModalCurrentY = clientY - quizModalStartY;

    qsModalContent.style.transform = `translate(${quizModalCurrentX}px, ${quizModalCurrentY}px)`;
  };

  const handleQuizModalDragEnd = () => {
    isDraggingQuizModal = false;
  };

  if (dragHandle) {
    dragHandle.addEventListener('mousedown', handleQuizModalDragStart);
    dragHandle.addEventListener('touchstart', handleQuizModalDragStart, { passive: false });
    window.addEventListener('mousemove', handleQuizModalDragMove);
    window.addEventListener('touchmove', handleQuizModalDragMove, { passive: false });
    window.addEventListener('mouseup', handleQuizModalDragEnd);
    window.addEventListener('touchend', handleQuizModalDragEnd);
  }

  // ★ スタンプ帳機能の処理
  const btnStampBookClose = document.getElementById('btn-stamp-book-close');
  const stampBookModal = document.getElementById('stamp-book-modal');
  const stampGrid = document.getElementById('stamp-grid');
  const stampCountDisplay = document.getElementById('stamp-count-display');
  const stampTotalDisplay = document.getElementById('stamp-total-display');

  function renderStampBook() {
    if (!stampGrid) return;
    stampGrid.innerHTML = '';
    // hiragana_data.js からスタンプになり得る emoji や svgType を集める
    const allStamps = [];
    const cells = [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells];
    cells.forEach(c => {
      if (c.emoji) allStamps.push({ type: 'emoji', value: c.emoji, char: c.char });
      else if (c.svgType) allStamps.push({ type: 'svg', value: c.svgType, char: c.char });
    });
    window.HIRAGANA_DATA.photoEmojis.forEach(e => {
      if (!allStamps.find(s => s.value === e)) allStamps.push({ type: 'emoji', value: e, char: '?' });
    });

    const validEarned = Array.isArray(earnedStamps) ? earnedStamps : [];
    if (stampTotalDisplay) stampTotalDisplay.textContent = allStamps.length;
    if (stampCountDisplay) stampCountDisplay.textContent = validEarned.length;

    allStamps.forEach((stampItem, i) => {
      const isEarned = validEarned.includes(stampItem.value);
      const div = document.createElement('div');
      div.className = 'w-full aspect-square rounded-[0.8vmin] border-[0.2vmin] flex flex-col items-center justify-center text-[3.5vmin] relative';
      if (isEarned) {
        div.classList.add('bg-orange-100', 'border-orange-300', 'shadow-sm');
        if (stampItem.type === 'emoji') {
          div.textContent = stampItem.value;
        } else {
          const img = document.createElement('img');
          img.src = `${stampItem.value}.png`;
          img.className = 'w-[80%] h-[80%] object-contain drop-shadow-sm';
          div.appendChild(img);
        }
      } else {
        div.classList.add('bg-gray-50', 'border-gray-200');
        div.textContent = '❔';
        div.style.opacity = '0.3';
      }
      stampGrid.appendChild(div);
    });
  };

  function checkAndAwardStamp(onComplete) {
    const allStamps = [];
    const cells = [...window.HIRAGANA_DATA.seionCells, ...window.HIRAGANA_DATA.dakuonCells];
    cells.forEach(c => {
      if (c.emoji) allStamps.push(c.emoji);
      else if (c.svgType) allStamps.push(c.svgType);
    });
    window.HIRAGANA_DATA.photoEmojis.forEach(e => {
      if (!allStamps.includes(e)) allStamps.push(e);
    });

    const unearned = allStamps.filter(s => !earnedStamps.includes(s));
    if (unearned.length > 0) {
      const newStamp = unearned[Math.floor(Math.random() * unearned.length)];
      earnedStamps.push(newStamp);
      try { localStorage.setItem('earnedStamps', JSON.stringify(earnedStamps)); } catch (e) { }

      setTimeout(() => {
        playSound('sp_3.mp3');
        showMessage('✨ おめでとう！<br>50もん せいかいしたから、<br>あたらしい スタンプを もらったよ！');

        isQuizPlaying = false; // クイズ進行を一時停止

        const waitForMsgClose = setInterval(() => {
          const modal = document.getElementById('message-modal');
          if (modal && modal.classList.contains('hidden')) {
            clearInterval(waitForMsgClose);

            renderStampBook();
            if (stampBookModal) {
              stampBookModal.style.zIndex = '9999';
              stampBookModal.classList.remove('hidden');
              stampBookModal.classList.add('flex');
            }

            const waitForStampClose = setInterval(() => {
              if (stampBookModal.classList.contains('hidden')) {
                clearInterval(waitForStampClose);
                isQuizPlaying = true;
                if (onComplete) onComplete();
              }
            }, 200);
          }
        }, 200);
      }, 1000); // Wait for the "correct" sound of the quiz answer to finish
    } else {
      if (onComplete) onComplete();
    }
  };

  if (btnStampBookClose) {
    btnStampBookClose.addEventListener('click', () => {
      playSound('cancel.wav');
      if (stampBookModal) {
        stampBookModal.classList.add('hidden');
        stampBookModal.classList.remove('flex');
      }
    });
  }

  // ★ ミニゲームの主要ロジック
  function startMinigame() {
    isMinigameActive = true;
    minigameScore = 0;
    minigameTargetCells = [];

    // 一時的にクイズ状態を解除してモーダルのOKボタンを押せるようにする
    isQuizPlaying = false;

    // 「ごほうび！」のポップアップと同時に sp_1.mp3 を再生
    playSound('sp_1.mp3');
    showMessage('🎉 ごほうび！<br>「もぐらたたき」が はじまるよ！<br>えを いっぱい タッチしよう！');

    const waitForModalClose = setInterval(() => {
      const modal = document.getElementById('message-modal');
      if (modal.classList.contains('hidden')) {
        clearInterval(waitForModalClose);
        isQuizPlaying = true; // モーダルが閉じたらクイズ（ゲーム）状態に戻す
        runMinigameLoop();
      }
    }, 200);
  }

  function runMinigameLoop() {
    // ポップアップOK後に再生する音を q_next.mp3 から seion.wav に変更
    playSound('seion.wav');

    // ミニゲーム専用UIとしてメッセージを表示
    const textContainer = document.getElementById('text-container');
    if (textContainer) {
      textContainer.innerHTML = `<div class="w-full flex justify-center items-center font-black text-rose-500 animate-pulse" style="font-size: 3cqw;">🕹️ いけー！ もぐらたたき！ (とくてん: <span id="minigame-score-badge">${minigameScore}</span>)</div>`;
    }

    window.CANVAS_ENGINE.renderBoard(getAppState());

    let cellIdCounter = 0;

    minigameInterval = setInterval(() => {
      // 最大5個まで
      if (minigameTargetCells.length < 5) {
        const emoji = '🐻'; // クマの顔に統一
        // 行1〜5, 列1〜10 のランダム座標
        const row = Math.floor(Math.random() * 5) + 1;
        const col = Math.floor(Math.random() * 10) + 1;

        const newCell = { id: cellIdCounter++, emoji: emoji, row: row, col: col };
        minigameTargetCells.push(newCell);

        // 自動消滅タイマー
        setTimeout(() => {
          if (isMinigameActive) {
            minigameTargetCells = minigameTargetCells.filter(c => c.id !== newCell.id);
            window.CANVAS_ENGINE.renderBoard(getAppState());
          }
        }, 1500 + Math.random() * 500); // 1.5〜2.0秒で消える

        window.CANVAS_ENGINE.renderBoard(getAppState());
      }
    }, 600); // 0.6秒ごとに新しいもぐら

    // 15秒後に終了
    minigameTimeout = setTimeout(() => {
      clearInterval(minigameInterval);
      isMinigameActive = false;
      minigameTargetCells = [];

      // 一時的にクイズ状態を解除してモーダルのOKボタンを押せるようにする
      isQuizPlaying = false;

      // ゲーム終わりで sp_2.mp3 を再生
      playSound('sp_2.mp3');
      showMessage(`タイムアップ！<br>すごい！ ${minigameScore}こ タッチできたよ！`);

      const waitForEndModalClose = setInterval(() => {
        const modal = document.getElementById('message-modal');
        if (modal.classList.contains('hidden')) {
          clearInterval(waitForEndModalClose);

          // スタンプチェックもここで行う (20と50の公倍数、つまり100の時にスタンプが被るため)
          if (totalQuizCorrectAnswers > 0 && totalQuizCorrectAnswers % 50 === 0) {
            if (typeof window !== 'undefined' && window.checkAndAwardStamp) {
              window.checkAndAwardStamp(() => {
                nextQuizQuestion(true);
              });
            } else {
              nextQuizQuestion(true);
            }
          } else {
            nextQuizQuestion(true);
          }
        }
      }, 200);

    }, 15000);
  };

  const initAudioEngine = async () => {
    const statusTxt = document.getElementById('loading-status-text');

    // 1. システム効果音 (SE) の個別読み込み（従来どおり）
    const seList = [
      'seion.wav', 'dakuon.wav', 'moji_namae.wav', 'kesu.wav', 'cancel.wav', 'zenbukesuno.wav', 'error.wav', 'ok.wav',
      'q_mondai1.mp3', 'q_mondai2.mp3', 'q_mondai3.mp3', 'q_correct.mp3', 'q_incorrect.mp3', 'q_next.mp3', 'q_outnext.mp3', 'q_end.mp3',
      'sp_1.mp3', 'sp_2.mp3', 'sp_3.mp3'
    ];
    for (const se of seList) {
      try { const res = await fetch(se); if (res.ok) { const ab = await res.arrayBuffer(); const dec = await audioCtx.decodeAudioData(ab); seBuffers.set(se, dec); } } catch (e) { }
    }

    // 2. 文字・名前用音声サンプルの一括読み込み (audio_samples.json)
    if (statusTxt) statusTxt.textContent = "音声データを一括読み込み中...";
    try {
      const res = await fetch('audio_samples.json');
      if (!res.ok) throw new Error('audio_samples.json not found');
      const audioJson = await res.json();
      
      const entries = Object.entries(audioJson);
      let loadedCount = 0;

      for (const [fileName, base64] of entries) {
        try {
          // Base64 to ArrayBuffer
          const bin = atob(base64);
          const len = bin.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
          
          // Decode
          const dec = await audioCtx.decodeAudioData(bytes.buffer);
          sampleBuffers.set(fileName, dec);
        } catch (e) { console.error(`Failed to decode ${fileName}`, e); }
        
        loadedCount++;
        if (loadedCount % 10 === 0) {
          const percent = Math.floor((loadedCount / entries.length) * 100);
          if (statusTxt) statusTxt.textContent = `音声をRAMに準備しています... (${percent}%)`;
        }
      }
    } catch (e) {
      console.error("Failed to load audio_samples.json", e);
      if (statusTxt) statusTxt.textContent = "音声データの読み込みに失敗しました。";
    }
  };

  // ★ 変更: initAudioEngine の前に Kuromoji エンジンを初期化する
  const initializeApp = async () => {
    try {
      try {
        const savedTotal = localStorage.getItem('totalQuizCorrectAnswers');
        if (savedTotal) totalQuizCorrectAnswers = parseInt(savedTotal, 10);
        const savedStamps = localStorage.getItem('earnedStamps');
        if (savedStamps) {
          const parsed = JSON.parse(savedStamps);
          if (Array.isArray(parsed)) earnedStamps = parsed;
        }
      } catch (e) { }

      // 1. エンジンの準備
      const statusTxt = document.getElementById('loading-status-text');
      if (statusTxt) statusTxt.textContent = "言語エンジンを準備しています...";
      await initKuromojiDB();
      const hasDict = await checkDictStatus();
      if (!hasDict) {
        await downloadDictFiles(statusTxt);
      }
      if (statusTxt) statusTxt.textContent = "言語エンジンを起動中...";
      await bootEngine();

      // 2. 音声とDBの準備
      if (statusTxt) statusTxt.textContent = "音声をRAMに準備しています... (0%)";
      await initDB();
      await loadAudioDataFromDB();
      await initAudioEngine();

      // 全て完了したらUIを表示
      lS.style.display = "none";
      sA.classList.replace('opacity-0', 'opacity-100');
      sA.classList.remove('pointer-events-none');

      updateTabUI();
      window.CANVAS_ENGINE.renderBoard(getAppState());
      updateButtons();
      updateTextDisplay();

      // グローバル関数として登録
      window.startMinigame = startMinigame;
      window.checkAndAwardStamp = checkAndAwardStamp;
      window.renderStampBook = renderStampBook;
    } catch (e) {
      console.error("App Init Error:", e);
      const statusTxt = document.getElementById('loading-status-text');
      if (statusTxt) statusTxt.textContent = "エラーが発生しました。リロードしてください。";
    }
  };

  initializeApp();
});