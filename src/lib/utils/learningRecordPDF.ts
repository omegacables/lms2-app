import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// 学習・テスト実施記録PDF（証拠書類）。
// 日本語の長文が複数ページに渡っても崩れないよう、HTMLをブラウザで描画→html2canvasで取得し、
// A4縦の高さでスライスして複数ページのjsPDFに貼り付ける。

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
    questions: {
      question_text: string;
      choices: string[];
      explanation?: string;
      attempts: { attempt_no: number; selected_text: string; is_correct: boolean | null; answered_at: string }[];
    }[];
  }[];
  essayQuizzes: {
    title: string;
    questions: { question_text: string; answers: { attempt_no: number; answer_text: string; answered_at: string }[] }[];
    reviews: { result: string; comment: string | null; explanation?: string | null; reviewer_name: string; reviewed_at: string }[];
  }[];
  testsPassed: boolean | null;
  totalWatchedSeconds: number;
  seal?: { stampUrl: string | null; signerName: string; signerTitle: string; companyName?: string } | null;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP') : '—');
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP') : '—');
const fmtDuration = (sec: number | null | undefined) => {
  if (!sec) return '0分';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
};

export function buildRecordHTML(d: LearningRecordData): string {
  const stdMin = d.course.standard_learning_minutes;
  const stdTime = stdMin ? `${Math.floor(stdMin / 60)}時間${stdMin % 60}分（${stdMin}分）` : '—';

  const videoRows = d.videos
    .map(
      (v, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(v.title)}</td>
        <td>${fmtDateTime(v.first_start)}</td>
        <td>${fmtDateTime(v.last_end)}</td>
        <td style="text-align:right">${fmtDuration(v.watched_seconds)}</td>
        <td style="text-align:right">${v.progress_percent}%</td>
        <td>${fmtDate(v.completed_at)}</td>
      </tr>`
    )
    .join('');

  const choiceSections = d.choiceQuizzes
    .map((q) => {
      const qs = q.questions
        .map((qq, qi) => {
          const choicesHtml = qq.choices.map((c, ci) => `${ci + 1}. ${esc(c)}`).join('<br>');
          const attemptRows = qq.attempts
            .map(
              (a) => `
              <tr>
                <td style="text-align:center">${a.attempt_no}</td>
                <td>${esc(a.selected_text)}</td>
                <td style="text-align:center">${a.is_correct === null ? '—' : a.is_correct ? '正解' : '不正解'}</td>
                <td>${fmtDateTime(a.answered_at)}</td>
              </tr>`
            )
            .join('');
          return `
            <div class="q">
              <div class="qh">問${qi + 1}. ${esc(qq.question_text)}</div>
              <div class="choices">${choicesHtml}</div>
              <table class="sub">
                <thead><tr><th>挑戦</th><th>選択した解答</th><th>正誤</th><th>回答日時</th></tr></thead>
                <tbody>${attemptRows || '<tr><td colspan="4" style="text-align:center">未回答</td></tr>'}</tbody>
              </table>
              ${qq.explanation ? `<div class="expl"><b>解説：</b>${esc(qq.explanation)}</div>` : ''}
            </div>`;
        })
        .join('');
      return `<div class="quiz"><div class="quiz-title">■ 小テスト：${esc(q.title)}</div>${qs}</div>`;
    })
    .join('');

  const essaySections = d.essayQuizzes
    .map((q) => {
      const qs = q.questions
        .map((qq, qi) => {
          const answers = qq.answers
            .map(
              (a) => `<div class="ans"><span class="ans-no">提出${a.attempt_no}（${fmtDateTime(a.answered_at)}）</span><div class="ans-body">${esc(a.answer_text)}</div></div>`
            )
            .join('');
          return `<div class="q"><div class="qh">問${qi + 1}. ${esc(qq.question_text)}</div>${answers || '<div class="ans-body">未提出</div>'}</div>`;
        })
        .join('');
      const stampImg = d.seal?.stampUrl
        ? `<img src="${d.seal.stampUrl}" alt="印" style="width:52px;height:52px;object-fit:contain;position:absolute;top:6px;right:8px;" crossorigin="anonymous" />`
        : '';
      const reviews = q.reviews
        .map(
          (r) => `
          <div class="review" style="position:relative;">
            ${stampImg}
            <div><b>添削結果：${r.result === 'passed' ? '合格' : '要再提出'}</b>　添削者：${esc(r.reviewer_name)}${d.seal?.signerTitle ? '（' + esc(d.seal.signerTitle) + '）' : ''}　${fmtDateTime(r.reviewed_at)}</div>
            ${r.comment ? `<div class="review-comment"><b>添削：</b>${esc(r.comment)}</div>` : ''}
            ${r.explanation ? `<div class="review-comment"><b>解説：</b>${esc(r.explanation)}</div>` : ''}
          </div>`
        )
        .join('');
      return `<div class="quiz"><div class="quiz-title">■ 記述式最終テスト：${esc(q.title)}</div>${qs}<div class="reviews-h">添削記録</div>${reviews || '<div>添削記録なし</div>'}</div>`;
    })
    .join('');

  return `
  <div style="font-family:'Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif;color:#111;font-size:12px;line-height:1.6;width:754px;padding:20px;background:#fff;">
    <style>
      h1{font-size:20px;text-align:center;margin:0 0 4px;}
      .sub-title{text-align:center;color:#555;font-size:11px;margin-bottom:16px;}
      table{width:100%;border-collapse:collapse;margin:6px 0 14px;}
      th,td{border:1px solid #bbb;padding:4px 6px;font-size:11px;vertical-align:top;}
      th{background:#f0f0f0;}
      .info td{border:1px solid #ccc;}
      .info .k{background:#f7f7f7;width:120px;font-weight:bold;}
      .section{font-size:14px;font-weight:bold;border-left:4px solid #1e5ab4;padding-left:8px;margin:18px 0 6px;}
      .quiz{margin:0 0 14px;}
      .quiz-title{font-weight:bold;margin:10px 0 4px;}
      .q{margin:8px 0;padding:8px;border:1px solid #e0e0e0;border-radius:4px;}
      .qh{font-weight:bold;margin-bottom:4px;}
      .choices{color:#333;font-size:11px;margin-bottom:6px;}
      .expl{font-size:11px;color:#333;margin-top:4px;background:#f5f8ff;border:1px solid #dde7ff;padding:5px;border-radius:3px;white-space:pre-wrap;}
      table.sub th,table.sub td{font-size:10px;padding:3px 5px;}
      .ans{margin:4px 0;}
      .ans-no{font-size:10px;color:#666;}
      .ans-body{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:6px;border-radius:3px;}
      .reviews-h{font-weight:bold;margin:8px 0 4px;}
      .review{border:1px solid #d0d0d0;border-radius:4px;padding:6px;margin:4px 0;background:#fbfbfb;}
      .review-comment{white-space:pre-wrap;margin-top:4px;}
      .footer{margin-top:20px;font-size:10px;color:#666;text-align:right;}
    </style>

    <h1>学習・テスト実施記録</h1>
    <div class="sub-title">${esc(d.course.title)}</div>

    <table class="info">
      <tr><td class="k">氏名</td><td>${esc(d.student.name)}</td><td class="k">所属</td><td>${esc(d.student.company)} ${esc(d.student.department)}</td></tr>
      <tr><td class="k">コース名</td><td>${esc(d.course.title)}</td><td class="k">訓練区分</td><td>${esc(d.course.training_type_note || '—')}</td></tr>
      <tr><td class="k">受講開始</td><td>${fmtDate(d.period.assigned_at)}</td><td class="k">修了日</td><td>${fmtDate(d.period.completion_date)}</td></tr>
      <tr><td class="k">標準学習時間</td><td>${stdTime}</td><td class="k">標準学習期間</td><td>${esc(d.course.standard_learning_period || '—')}</td></tr>
      <tr><td class="k">受講時間合計</td><td>${fmtDuration(d.totalWatchedSeconds)}</td><td class="k">テスト通過</td><td>${d.testsPassed === null ? '—' : d.testsPassed ? '全通過' : '未通過'}</td></tr>
      <tr><td class="k">証明書ID</td><td>${esc(d.certificate?.id || '—')}</td><td class="k">発行日</td><td>${fmtDate(d.certificate?.completion_date || null)}</td></tr>
    </table>

    <div class="section">1. 学習記録（動画視聴）</div>
    <table>
      <thead><tr><th>#</th><th>動画</th><th>受講開始日時</th><th>受講終了日時</th><th>視聴時間</th><th>進捗率</th><th>完了日</th></tr></thead>
      <tbody>${videoRows || '<tr><td colspan="7" style="text-align:center">記録なし</td></tr>'}</tbody>
    </table>

    ${d.choiceQuizzes.length > 0 ? `<div class="section">2. 小テスト記録</div>${choiceSections}` : ''}
    ${d.essayQuizzes.length > 0 ? `<div class="section">3. 記述式最終テスト・添削記録</div>${essaySections}` : ''}

    <div class="footer">出力日: ${new Date().toLocaleString('ja-JP')}</div>
  </div>`;
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

  try {
    const el = wrapper.firstElementChild as HTMLElement;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWmm = 210;
    const pageHmm = 297;
    const pxPerMm = canvas.width / pageWmm;
    const pageHpx = Math.floor(pageHmm * pxPerMm);

    let rendered = 0;
    let first = true;
    while (rendered < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - rendered);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const img = pageCanvas.toDataURL('image/png');
      const sliceHmm = sliceH / pxPerMm;
      if (!first) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, 0, pageWmm, sliceHmm);
      first = false;
      rendered += sliceH;
    }

    const safeName = (d.student.name || 'user').replace(/[^a-zA-Z0-9　-鿿]/g, '_');
    const safeCourse = (d.course.title || 'course').replace(/[^a-zA-Z0-9　-鿿]/g, '_');
    const fileName = `実施記録_${safeCourse}_${safeName}.pdf`;
    const blob = pdf.output('blob');
    return { blob, fileName };
  } finally {
    document.body.removeChild(wrapper);
  }
}
