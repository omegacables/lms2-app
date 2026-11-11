import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { circledNumber } from '@/lib/quiz/redpen';
import { fmtYmd, type WorkException, type WorkSchedule } from '@/lib/records/workSchedule';
import type { AnswerDateEntry } from '@/lib/records/answerDates';
import type { CompanyTrainingPeriod } from '@/lib/companies/companySettings';

// テスト実施記録PDF（証拠書類）。小テスト・最終テストの回答と添削を載せる（動画の視聴記録は学習ログで見る）。
// 日付は基本情報（研修開始日・研修終了日・受講開始・修了日・発行日）だけ。
// 「1. 小テスト記録」より下には日付を載せない（SHOW_TEST_DATES）。
// 研修開始日・研修終了日は会社ごとの任意の設定（company_settings）。設定のある会社の受講者だけ行を出す。
// 回答日・就業時間外かどうか・回答日の修正は、画面の「日付・就業日」（RecordEditPanel）で確認する。
// 日本語の長文が複数ページに渡っても崩れないよう、HTMLをブラウザで描画→html2canvasで画像にして
// A4縦のjsPDFに貼り付ける。画面での閲覧（RecordViewer）も同じ HTML（buildRecordHTML）を使う。
// - 改ページ位置は DOM の位置から決め、文字の行・表の行・小さなまとまりの途中では切らない
// - サイトの CSS（Tailwind の img{display:block}）が当たると、html2canvas が文字の基準線を測り違えて
//   文字・下線・取り消し線が数px下にずれる。PDF の作成中だけ、計測用の要素にこれを当てないようにする
// - 1ページずつ JPEG で貼る（無圧縮の PNG だと1ページ約9MBになっていた）

/** 回答日の表示（日本時間の日付・修正の有無・就業日／就業時間の外かどうか） */
interface AnswerDateFields {
  /** 実施記録に載せる日付 'YYYY-MM-DD'（修正があれば修正後） */
  answered_date?: string | null;
  date_corrected?: boolean;
  /** 就業日・就業時間の外なら理由（「休日」「祝日」「就業時間外」） */
  off_reason?: string | null;
}

/** 回答・提出1回ごとの回答日（画面で日付を修正するのに使う） */
export type { AnswerDateEntry };

export interface LearningRecordData {
  student: { name: string; email: string; company: string; department: string };
  course: {
    title: string;
    standard_learning_minutes: number | null;
    standard_learning_period: string | null;
    training_type_note: string | null;
    test_required: boolean;
  };
  period: { assigned_at: string | null; completion_date: string | null };
  /** 会社ごとの研修開始日・研修終了日（任意の設定。どちらも未設定の会社は null） */
  trainingPeriod?: CompanyTrainingPeriod | null;
  certificate: { id: string; completion_date: string } | null;
  videos: {
    title: string;
    first_start: string | null;
    last_end: string | null;
    watched_seconds: number;
    progress_percent: number;
    completed_at: string | null;
  }[];
  choiceQuizzes: {
    title: string;
    /** 小テストの自動添削（AI）。講師が確認していれば確認した講師名 */
    auto_review?: {
      comment: string | null;
      /** 署名（「講師　名前」） */
      signature?: string;
      generated_at: string | null;
      confirmed: boolean;
      reviewer_name: string | null;
      confirmed_at: string | null;
      edited: boolean;
    } | null;
    questions: {
      question_text: string;
      choices: string[];
      explanation?: string;
      attempts: ({ attempt_no: number; selected_text: string; is_correct: boolean | null; answered_at: string } & AnswerDateFields)[];
      /** 自動添削（AI）の設問ごとの講評・赤ペン */
      auto_mark?: {
        comment: string | null;
        markup?: { type: 'keep' | 'del' | 'ins'; text: string; note?: string | null }[] | null;
      } | null;
    }[];
  }[];
  essayQuizzes: {
    title: string;
    /** 「記述式最終テスト」／「最終テスト（選択式）」など、見出しに使う表記 */
    type_label?: string;
    questions: {
      question_text: string;
      answers: ({ attempt_no: number; answer_text: string; answered_at: string } & AnswerDateFields)[];
      /** 指導者が設問ごとに付けたコメント・赤ペン（最新の添削）。正誤は記録に載せない */
      review_mark?: {
        is_correct: boolean | null;
        comment: string | null;
        markup?: { type: 'keep' | 'del' | 'ins'; text: string; note?: string | null }[] | null;
      } | null;
    }[];
    /** 最新の添削の署名（「講師　名前」。赤ペンの署名に使う） */
    signer_label?: string;
    /** 自動添削（auto）の reviewer_name は「講師　担当講師の名前」。confirmed_by は自動添削を確認した講師 */
    reviews: {
      result: string;
      comment: string | null;
      explanation?: string | null;
      reviewer_name: string;
      auto?: boolean;
      confirmed_by?: string;
      reviewed_at: string;
    }[];
  }[];
  testsPassed: boolean | null;
  totalWatchedSeconds: number;
  seal?: { stampUrl: string | null; signerName: string; signerTitle: string; companyName?: string } | null;
  answerDates?: AnswerDateEntry[];
  /** 回答日の修正記録（実施記録に載せる） */
  dateCorrections?: {
    quiz_title: string;
    attempt_no: number;
    original_date: string;
    corrected_date: string;
    reason: string;
    corrected_by_name: string;
    corrected_at: string;
  }[];
  workSchedule?: WorkSchedule | null;
  /** 「月〜金 9:00〜18:00・祝日休み」 */
  workScheduleSummary?: string;
  workExceptions?: WorkException[];
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: unknown) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP') : '—');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP') : '—');

/**
 * 「1. 小テスト記録」より下に日付（回答日・添削日時・出力日）を載せるか。
 * 2026-11-10 の依頼で、載せないことにした（false）。
 *
 * 回答日は管理者が修正できる（quiz_answer_date_corrections）。日付を載せるなら、修正後の日付だけを載せると
 * 証拠書類が事実と違ってしまうので、必ず「（修正）」の印と「回答日の修正記録」も一緒に載せる。
 * ばらばらに切り替えられないよう、この1つの設定でまとめて切り替える。
 */
const SHOW_TEST_DATES: boolean = false;

/** 回答日（日付だけ）。就業日・就業時間の外は赤字、修正したものは「（修正）」を付ける */
function answerDateHTML(a: { answered_at: string } & AnswerDateFields): string {
  const text = a.answered_date ? fmtYmd(a.answered_date) : fmtDate(a.answered_at);
  const date = a.off_reason
    ? `<span class="off" title="${escAttr(a.off_reason)}">${esc(text)}</span>`
    : esc(text);
  return `${date}${a.date_corrected ? '<span class="dc">（修正）</span>' : ''}`;
}
const fmtDuration = (sec: number | null | undefined) => {
  if (!sec) return '0分';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
};

/**
 * 1文字ずつ span で包む。html2canvas は複数行にまたがるインライン要素の背景・枠線・文字飾りを
 * 1つの四角として描いてしまう（行をまたいで塗られる・線がずれる）ため、1文字ずつに分けて描かせる。
 */
function perChar(text: string, cls: string): string {
  return Array.from(text)
    // 半角スペースは改行しない空白にして、行末で消えて線が途切れないようにする
    .map((ch) => (ch === '\n' ? '\n' : `<span class="${cls}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`))
    .join('');
}

/** 赤ペン添削を HTML にする（取り消し線・書き足し・吹き出し番号＋コメント一覧＋署名）。signature は「講師　名前」などの完成形 */
function renderRedPenHTML(
  segments: { type: 'keep' | 'del' | 'ins'; text: string; note?: string | null }[],
  signature: string,
  title = '添削'
): string {
  let n = 0;
  const notes: string[] = [];
  const body = segments
    .map((sg) => {
      let marker = '';
      if (sg.note) {
        n += 1;
        const label = circledNumber(n);
        marker = `<sup class="rp-mark">${label}</sup>`;
        notes.push(`<div class="rp-note keep"><span class="rp-mark">${label}</span> ${esc(sg.note)}</div>`);
      }
      if (sg.type === 'del') return perChar(sg.text, 'rp-del') + marker;
      if (sg.type === 'ins') return perChar(sg.text, 'rp-ins') + marker;
      if (sg.note) return perChar(sg.text, 'rp-hl') + marker;
      return esc(sg.text);
    })
    .join('');
  return `<div class="rp">
    <div class="rp-title keep-next">${esc(title)}</div>
    <div class="rp-body">${body}</div>
    ${notes.length > 0 ? `<div class="rp-notes">${notes.join('')}</div>` : ''}
    ${signature ? `<div class="rp-sign keep">${esc(signature)}</div>` : ''}
  </div>`;
}

// 記録の見た目（.lr-doc の中だけに効くようにする。画面での閲覧時にサイトの表示を崩さないため）
const RECORD_CSS = `
.lr-doc{font-family:'Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif;color:#111;font-size:12px;line-height:1.6;width:754px;padding:0 24px;box-sizing:border-box;background:#fff;text-align:left;}
.lr-doc *{box-sizing:border-box;}
.lr-doc h1{font-size:20px;font-weight:bold;text-align:center;margin:0 0 4px;padding-top:2px;}
.lr-doc .sub-title{text-align:center;color:#555;font-size:11px;margin-bottom:16px;}
.lr-doc table{width:100%;border-collapse:collapse;margin:6px 0 14px;}
.lr-doc th,.lr-doc td{border:1px solid #bbb;padding:4px 6px;font-size:11px;vertical-align:top;text-align:left;}
.lr-doc th{background:#f0f0f0;font-weight:bold;}
.lr-doc .c{text-align:center;}
.lr-doc .r{text-align:right;}
.lr-doc .nw{white-space:nowrap;}
.lr-doc .info td{border:1px solid #ccc;}
.lr-doc .info .k{background:#f7f7f7;width:120px;font-weight:bold;}
.lr-doc .section{font-size:14px;font-weight:bold;border-left:4px solid #1e5ab4;padding-left:8px;margin:18px 0 6px;line-height:1.5;}
.lr-doc .quiz{margin:0 0 14px;}
.lr-doc .quiz-title{font-weight:bold;margin:10px 0 4px;}
.lr-doc .q{margin:8px 0;padding:8px;border:1px solid #e0e0e0;border-radius:4px;}
.lr-doc .qh{font-weight:bold;margin-bottom:4px;}
.lr-doc .choices{color:#333;font-size:11px;margin-bottom:6px;}
.lr-doc .expl{font-size:11px;color:#333;margin-top:4px;background:#f5f8ff;border:1px solid #dde7ff;padding:5px;border-radius:3px;white-space:pre-wrap;}
.lr-doc table.sub{margin:4px 0 8px;}
.lr-doc table.sub th,.lr-doc table.sub td{font-size:10px;padding:3px 5px;}
.lr-doc table.sub .no{width:26px;}
.lr-doc table.sub .dt{width:112px;white-space:nowrap;}
.lr-doc .off{color:#d00;font-weight:bold;}
.lr-doc .dc{font-size:9px;color:#555;}
.lr-doc .legend{font-size:10px;color:#444;margin:-8px 0 10px;}
.lr-doc .legend .off{font-weight:bold;}
.lr-doc .empty{color:#666;margin:8px 0 14px;}
.lr-doc .ans{margin:4px 0;}
.lr-doc .ans-no{font-size:10px;color:#666;}
.lr-doc .ans-body{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:6px;border-radius:3px;}
.lr-doc .reviews-h{font-weight:bold;margin:8px 0 4px;}
.lr-doc .review{position:relative;border:1px solid #d0d0d0;border-radius:4px;padding:6px;margin:4px 0;background:#fbfbfb;}
.lr-doc .review.has-stamp{padding-right:70px;min-height:66px;}
.lr-doc .review .stamp{display:inline-block;width:52px;height:52px;object-fit:contain;position:absolute;top:6px;right:8px;}
.lr-doc .review-comment{white-space:pre-wrap;margin-top:4px;}
.lr-doc .rp{margin-top:6px;border:1px solid #f3b4b4;border-radius:4px;padding:6px 8px;}
.lr-doc .rp-title{font-size:10px;color:#d00;font-weight:bold;}
.lr-doc .rp-body{line-height:1.9;white-space:pre-wrap;}
.lr-doc .rp-del{color:#d00;background-image:linear-gradient(to bottom,transparent 50%,#d00 50%,#d00 57%,transparent 57%);}
.lr-doc .rp-ins{color:#d00;border-bottom:1px solid #d00;}
.lr-doc .rp-hl{background:#fde8e8;border-bottom:1px dashed #d00;}
.lr-doc .rp-mark{color:#d00;font-weight:bold;}
.lr-doc sup.rp-mark{font-size:9px;line-height:0;vertical-align:super;position:static;}
.lr-doc .rp-notes{margin-top:4px;font-size:11px;}
.lr-doc .rp-note{margin-top:2px;}
.lr-doc .rp-sign{text-align:right;color:#d00;margin-top:4px;}
.lr-doc .footer{margin-top:20px;font-size:10px;color:#666;text-align:right;}
`;

export function buildRecordHTML(d: LearningRecordData): string {
  const stdMin = d.course.standard_learning_minutes;
  const stdTime = stdMin ? `${Math.floor(stdMin / 60)}時間${stdMin % 60}分（${stdMin}分）` : '—';

  const choiceSections = d.choiceQuizzes
    .map((q) => {
      const qs = q.questions
        .map((qq, qi) => {
          const choicesHtml = qq.choices.map((c, ci) => `${ci + 1}. ${esc(c)}`).join('<br>');
          const attemptRows = qq.attempts
            .map(
              (a) => `
              <tr>
                <td class="c">${esc(a.attempt_no)}</td>
                <td>${esc(a.selected_text)}</td>
                ${SHOW_TEST_DATES ? `<td class="dt">${answerDateHTML(a)}</td>` : ''}
              </tr>`
            )
            .join('');
          return `
            <div class="q">
              <div class="qh keep-next">問${qi + 1}. ${esc(qq.question_text)}</div>
              <div class="choices keep">${choicesHtml}</div>
              <table class="sub">
                <thead class="keep-next"><tr><th class="no c nw">回</th><th>選択した解答</th>${SHOW_TEST_DATES ? '<th class="dt">回答日</th>' : ''}</tr></thead>
                <tbody>${attemptRows || `<tr><td colspan="${SHOW_TEST_DATES ? 3 : 2}" class="c">未回答</td></tr>`}</tbody>
              </table>
              ${qq.explanation ? `<div class="expl keep"><b>解説：</b>${esc(qq.explanation)}</div>` : ''}
              ${qq.auto_mark?.comment ? `<div class="expl keep"><b>講評：</b>${esc(qq.auto_mark.comment)}</div>` : ''}
              ${qq.auto_mark?.markup && qq.auto_mark.markup.length > 0
                ? renderRedPenHTML(qq.auto_mark.markup, q.auto_review?.signature || '講師')
                : ''}
            </div>`;
        })
        .join('');
      const ar = q.auto_review;
      const autoLine = ar
        ? `<div class="expl keep" style="margin:2px 0 6px;">添削：${esc(ar.signature || '講師')}（AIによる自動添削${
            SHOW_TEST_DATES ? `　${fmtDateTime(ar.generated_at)}` : ''
          }）${
            ar.confirmed
              ? `　／　講師の確認：${esc(ar.reviewer_name || '')}${SHOW_TEST_DATES ? `（${fmtDateTime(ar.confirmed_at)}）` : ''}${ar.edited ? '・講師が修正' : ''}`
              : ''
          }${ar.comment ? `<br><b>全体のコメント：</b>${esc(ar.comment)}` : ''}</div>`
        : '';
      return `<div class="quiz"><div class="quiz-title keep-next">■ 小テスト：${esc(q.title)}</div>${autoLine}${qs}</div>`;
    })
    .join('');

  const essaySections = d.essayQuizzes
    .map((q) => {
      const qs = q.questions
        .map((qq, qi) => {
          const answers = qq.answers
            .map(
              (a) => `<div class="ans keep"><span class="ans-no">提出${esc(a.attempt_no)}${SHOW_TEST_DATES ? `（${answerDateHTML(a)}）` : ''}</span><div class="ans-body">${esc(a.answer_text)}</div></div>`
            )
            .join('');
          const mark = qq.review_mark;
          const redpenHtml = mark?.markup && mark.markup.length > 0 ? renderRedPenHTML(mark.markup, q.signer_label || '') : '';
          // 設問ごとの添削コメント（正誤は記載しない）
          const markHtml = mark?.comment ? `<div class="ans-body keep" style="margin-top:2px;"><b>添削：</b>${esc(mark.comment)}</div>` : '';
          return `<div class="q"><div class="qh keep-next">問${qi + 1}. ${esc(qq.question_text)}</div>${answers || '<div class="ans-body">未提出</div>'}${markHtml}${redpenHtml}</div>`;
        })
        .join('');
      const stampImg = d.seal?.stampUrl
        ? `<img class="stamp" src="${escAttr(d.seal.stampUrl)}" alt="印" crossorigin="anonymous" />`
        : '';
      const reviews = q.reviews
        .map(
          (r) => `
          <div class="review keep${stampImg ? ' has-stamp' : ''}">
            ${stampImg}
            <div><b>添削結果：${r.result === 'passed' ? '合格' : '要再提出'}</b>　添削者：${esc(r.reviewer_name)}${
              r.auto
                ? `（AIによる自動添削${r.confirmed_by ? `・講師の確認：${esc(r.confirmed_by)}` : ''}）`
                : d.seal?.signerTitle
                ? '（' + esc(d.seal.signerTitle) + '）'
                : ''
            }${SHOW_TEST_DATES ? `　${fmtDateTime(r.reviewed_at)}` : ''}</div>
            ${r.comment ? `<div class="review-comment"><b>添削：</b>${esc(r.comment)}</div>` : ''}
            ${r.explanation ? `<div class="review-comment"><b>解説：</b>${esc(r.explanation)}</div>` : ''}
          </div>`
        )
        .join('');
      return `<div class="quiz"><div class="quiz-title keep-next">■ ${esc(q.type_label || '記述式最終テスト')}：${esc(q.title)}</div>${qs}<div class="reviews-h keep-next">添削記録</div>${reviews || '<div>添削記録なし</div>'}</div>`;
    })
    .join('');

  // 見出しの番号は載せる節だけで振る
  let sectionNo = 0;
  const sectionHead = (label: string) => `<div class="section keep-next">${++sectionNo}. ${esc(label)}</div>`;

  // 回答日を載せないときは、修正の記録・赤字の説明も載せない（載せる日付が無いので）
  const corrections = SHOW_TEST_DATES ? d.dateCorrections || [] : [];
  const correctionRows = corrections
    .map(
      (c) => `
      <tr>
        <td>${esc(c.quiz_title)}</td>
        <td class="c nw">${esc(c.attempt_no)}</td>
        <td class="nw">${esc(fmtYmd(c.original_date))}</td>
        <td class="nw">${esc(fmtYmd(c.corrected_date))}</td>
        <td>${esc(c.reason)}</td>
        <td class="nw">${esc(c.corrected_by_name || '—')}</td>
        <td class="nw">${fmtDate(c.corrected_at)}</td>
      </tr>`
    )
    .join('');

  const hasOff =
    SHOW_TEST_DATES &&
    (d.choiceQuizzes.some((q) => q.questions.some((qq) => qq.attempts.some((a) => a.off_reason))) ||
      d.essayQuizzes.some((q) => q.questions.some((qq) => qq.answers.some((a) => a.off_reason))));
  const legend = hasOff
    ? `<div class="legend keep"><span class="off">赤字の回答日</span>：就業日・就業時間の外に回答したもの${
        d.workScheduleSummary ? `（就業日・時間：${esc(d.workScheduleSummary)}）` : ''
      }</div>`
    : '';

  const testSections =
    (d.choiceQuizzes.length > 0 ? `${sectionHead('小テスト記録')}${choiceSections}` : '') +
    (d.essayQuizzes.length > 0 ? `${sectionHead('最終テスト・添削記録')}${essaySections}` : '');

  // 修了日と発行日は同じ日（修了証は修了した日に発行される。どちらも certificates.completion_date）
  const completionDate = fmtDate(d.period.completion_date ?? d.certificate?.completion_date ?? null);

  // 会社ごとの研修期間（任意の設定）。どちらかが設定されている会社だけ行を出し、設定の無い方は「—」にする
  const training = d.trainingPeriod;
  const trainingRow =
    training && (training.training_start_date || training.training_end_date)
      ? `<tr><td class="k">研修開始日</td><td>${fmtYmd(training.training_start_date)}</td><td class="k">研修終了日</td><td>${fmtYmd(training.training_end_date)}</td></tr>`
      : '';

  return `
  <div class="lr-doc">
    <style>${RECORD_CSS}</style>

    <h1 class="keep-next">テスト実施記録</h1>
    <div class="sub-title">${esc(d.course.title)}</div>

    <table class="info keep">
      <tr><td class="k">氏名</td><td>${esc(d.student.name)}</td><td class="k">所属</td><td>${esc(d.student.company)} ${esc(d.student.department)}</td></tr>
      <tr><td class="k">コース名</td><td>${esc(d.course.title)}</td><td class="k">訓練区分</td><td>${esc(d.course.training_type_note || '—')}</td></tr>
      ${trainingRow}
      <tr><td class="k">受講開始</td><td>${fmtDate(d.period.assigned_at)}</td><td class="k">修了日</td><td>${completionDate}</td></tr>
      <tr><td class="k">標準学習時間</td><td>${stdTime}</td><td class="k">標準学習期間</td><td>${esc(d.course.standard_learning_period || '—')}</td></tr>
      <tr><td class="k">受講時間合計</td><td>${fmtDuration(d.totalWatchedSeconds)}</td><td class="k">テスト通過</td><td>${d.testsPassed === null ? '—' : d.testsPassed ? '全通過' : '未通過'}</td></tr>
      <tr><td class="k">証明書ID</td><td>${esc(d.certificate?.id || '—')}</td><td class="k">発行日</td><td>${d.certificate ? completionDate : '—'}</td></tr>
    </table>
    ${legend}

    ${testSections || '<div class="empty">このコースのテストの記録はありません。</div>'}

    ${
      corrections.length > 0
        ? `${sectionHead('回答日の修正記録')}
    <table>
      <thead class="keep-next"><tr><th>テスト</th><th class="c nw">回</th><th class="nw">元の回答日</th><th class="nw">修正後の日付</th><th>理由</th><th class="nw">修正者</th><th class="nw">修正日</th></tr></thead>
      <tbody>${correctionRows}</tbody>
    </table>`
        : ''
    }

    ${SHOW_TEST_DATES ? `<div class="footer keep">出力日: ${new Date().toLocaleString('ja-JP')}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// PDF 化
// ---------------------------------------------------------------------------

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const SCALE = 2;
/** 各ページの上下の余白（CSS px） */
const MARGIN_PX = 30;
/** 1回の html2canvas で描く高さの上限（CSS px）。ブラウザのキャンバスの上限（約32,000px）を超えないように */
const MAX_CHUNK_PX = 6000;

interface Span {
  top: number;
  bottom: number;
}

/**
 * html2canvas は文字の基準線を、body 直下に作った visibility:hidden の div 内の img の位置から測る。
 * Tailwind の img{display:block} が当たると基準線を大きく測り違え、文字や線が下にずれて描かれるので、
 * PDF を作るあいだだけ、その計測用の img を inline に戻す。
 */
function applyFontMetricsFix(): () => void {
  const style = document.createElement('style');
  style.setAttribute('data-learning-record-pdf', '');
  style.textContent =
    'body > div[style*="visibility: hidden"][style*="white-space: nowrap"] > img{display:inline !important;}';
  document.head.appendChild(style);
  return () => style.remove();
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? null
        : new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 5000);
          })
    )
  );
}

/**
 * ページの途中で切ってはいけない範囲（root の上端からの位置）を集める。
 * withBlocks=false のときは文字の行・表の行・画像だけ（まとまりが大きすぎて切れ目が見つからないときに使う）。
 */
function collectSpans(root: HTMLElement, withBlocks: boolean, maxBlockPx: number): Span[] {
  const base = root.getBoundingClientRect().top;
  const spans: Span[] = [];
  const push = (top: number, bottom: number) => {
    if (bottom - top > 0.5) spans.push({ top: top - base, bottom: bottom - base });
  };

  // 文字の行（テキストノードの行ごとの矩形）
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent || !node.textContent.trim()) continue;
    if (node.parentElement?.closest('style')) continue;
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) push(r.top, r.bottom);
  }

  // 表の行・画像
  root.querySelectorAll('tr, img').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height <= maxBlockPx) push(r.top, r.bottom);
  });

  if (withBlocks) {
    // 小さなまとまり（解説・添削記録など）は同じページに収める
    root.querySelectorAll('.keep').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height <= maxBlockPx) push(r.top, r.bottom);
    });
    // 見出しはページの最後に取り残さない（直後の内容と同じページに置く）
    root.querySelectorAll('.keep-next').forEach((el) => {
      const r = el.getBoundingClientRect();
      push(r.top, r.bottom + 40);
    });
  }
  return spans;
}

/** 重なる範囲をまとめる（接しているだけの範囲の境目では切れるよう、1px ずつ内側に縮めてから比べる） */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans
    .map((s) => ({ top: s.top + 1, bottom: s.bottom - 1 }))
    .filter((s) => s.bottom > s.top)
    .sort((a, b) => a.top - b.top);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.top < last.bottom) last.bottom = Math.max(last.bottom, s.bottom);
    else out.push({ ...s });
  }
  return out;
}

/** target の位置で切れるか。範囲の内側なら範囲の上で切る。minCut より上にしか切れ目が無ければ null */
function findCut(merged: Span[], target: number, minCut: number): number | null {
  const hit = merged.find((m) => m.top < target && target < m.bottom);
  const cut = hit ? Math.floor(hit.top - 1) : target;
  return cut >= minCut ? cut : null;
}

/** ページの区切り（root の上端からの位置）を決める */
function paginate(root: HTMLElement, totalH: number, contentH: number): Span[] {
  const maxBlock = contentH * 0.45;
  const blockLevel = mergeSpans(collectSpans(root, true, maxBlock));
  const lineLevel = mergeSpans(collectSpans(root, false, maxBlock));
  const pages: Span[] = [];
  let start = 0;
  while (totalH - start > contentH) {
    const target = start + contentH;
    let cut = findCut(blockLevel, target, start + contentH * 0.5);
    if (cut === null) cut = findCut(lineLevel, target, start + 40);
    if (cut === null || cut <= start) cut = target;
    pages.push({ top: start, bottom: cut });
    start = cut;
  }
  pages.push({ top: start, bottom: totalH });
  return pages;
}

/** 続くページをまとめて1回で描く（描く回数を減らしつつ、キャンバスの上限を超えないように） */
function groupChunks(pages: Span[], maxPx: number): Span[][] {
  const chunks: Span[][] = [];
  let cur: Span[] = [];
  for (const p of pages) {
    if (cur.length > 0 && p.bottom - cur[0].top > maxPx) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

export async function generateLearningRecordPDFBlob(
  d: LearningRecordData
): Promise<{ blob: Blob; fileName: string }> {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-99999px';
  wrapper.style.top = '0';
  wrapper.innerHTML = buildRecordHTML(d);
  document.body.appendChild(wrapper);
  const removeFix = applyFontMetricsFix();

  try {
    const el = wrapper.querySelector('.lr-doc') as HTMLElement;
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(el);

    const pageW = el.offsetWidth;
    const pageH = Math.floor((pageW * PAGE_H_MM) / PAGE_W_MM);
    const contentH = pageH - MARGIN_PX * 2;
    const totalH = Math.ceil(el.getBoundingClientRect().height);
    const pages = paginate(el, totalH, contentH);

    const pdf = new jsPDF('p', 'mm', 'a4');
    let index = 0;
    for (const chunk of groupChunks(pages, MAX_CHUNK_PX)) {
      const top = chunk[0].top;
      const bottom = chunk[chunk.length - 1].bottom;
      const canvas = await html2canvas(el, {
        scale: SCALE,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: pageW,
        y: top,
        height: bottom - top,
      });

      for (const p of chunk) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = Math.round(pageW * SCALE);
        pageCanvas.height = Math.round(pageH * SCALE);
        const ctx = pageCanvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        const sy = Math.round((p.top - top) * SCALE);
        const sh = Math.min(Math.round((p.bottom - p.top) * SCALE), canvas.height - sy);
        if (sh > 0) {
          ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, Math.round(MARGIN_PX * SCALE), canvas.width, sh);
        }

        // ページ番号
        ctx.fillStyle = '#888888';
        ctx.font = `${10 * SCALE}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1} / ${pages.length}`, pageCanvas.width / 2, pageCanvas.height - (MARGIN_PX * SCALE) / 2);

        if (index > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, PAGE_W_MM, PAGE_H_MM);
        index += 1;
      }
    }

    const safeName = (d.student.name || 'user').replace(/[^a-zA-Z0-9　-鿿]/g, '_');
    const safeCourse = (d.course.title || 'course').replace(/[^a-zA-Z0-9　-鿿]/g, '_');
    const fileName = `テスト実施記録_${safeCourse}_${safeName}.pdf`;
    const blob = pdf.output('blob');
    return { blob, fileName };
  } finally {
    removeFix();
    document.body.removeChild(wrapper);
  }
}
