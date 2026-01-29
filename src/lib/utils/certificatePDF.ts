import { jsPDF } from 'jspdf';
import { generateCertificateId } from './index';

export interface CertificateData {
  certificateId?: string;
  courseName: string;
  userName: string;
  completionDate: string;
  issueDate: string;
  totalVideos: number;
  totalWatchTime: number;
  courseDescription?: string;
  organization?: string;
  company?: string;
  // 署名情報（システム設定から取得）
  issuerCompanyName?: string;  // 発行元会社名
  signerName?: string;          // 署名者氏名
  signerTitle?: string;         // 署名者役職
  stampImageUrl?: string;       // 印鑑画像URL
}

export async function generateCertificatePDF(certificateData: CertificateData) {
  // 証明書IDと検証コードを生成
  const certificateNumber = certificateData.certificateId || generateCertificateId();
  const verificationCode = Math.random().toString(36).substring(2, 18).toUpperCase();

  console.log('=== 証明書PDF生成開始 ===');
  console.log('証明書データ:', {
    certificateId: certificateNumber,
    userName: certificateData.userName,
    courseName: certificateData.courseName,
    issuerCompanyName: certificateData.issuerCompanyName,
    signerName: certificateData.signerName,
    signerTitle: certificateData.signerTitle,
    stampImageUrl: certificateData.stampImageUrl
  });

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // カスタムフォントの登録（Base64エンコードされた日本語フォントが必要）
  // 実際の実装では、NotoSansJP等の日本語フォントをBase64で埋め込む必要があります

  // 代替案: Canvas APIを使用して画像として生成し、PDFに埋め込む
  const canvas = document.createElement('canvas');
  canvas.width = 2970; // A4横 297mm × 10
  canvas.height = 2100; // A4縦 210mm × 10
  const ctx = canvas.getContext('2d')!;

  // 背景
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 枠線
  ctx.strokeStyle = '#c8b48c';
  ctx.lineWidth = 20;
  ctx.strokeRect(100, 100, 2770, 1900);
  ctx.lineWidth = 5;
  ctx.strokeRect(150, 150, 2670, 1800);

  // フォント設定
  ctx.fillStyle = '#323232';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // タイトル
  ctx.font = 'bold 180px "Noto Sans JP", sans-serif';
  ctx.fillText('修了証明書', canvas.width / 2, 450);

  // Certificate of Completion
  ctx.font = '60px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#646464';
  ctx.fillText('Certificate of Completion', canvas.width / 2, 550);

  // 受講者名
  ctx.font = 'bold 120px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#323232';
  ctx.fillText(certificateData.userName || 'ユーザー', canvas.width / 2, 800);

  // 会社名
  if (certificateData.company) {
    ctx.font = '60px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#505050';
    ctx.fillText(certificateData.company, canvas.width / 2, 900);
  }

  // 本文
  ctx.font = '50px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#505050';
  ctx.fillText('上記の者は、下記のコースを修了したことを証明いたします。', canvas.width / 2, 1100);

  // コース名
  ctx.font = 'bold 90px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#1e5ab4';
  ctx.fillText(certificateData.courseName || 'コース名', canvas.width / 2, 1300);

  // 発行日
  ctx.font = '45px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#505050';
  ctx.fillText(`発行日: ${certificateData.completionDate || new Date().toLocaleDateString('ja-JP')}`, canvas.width / 2, 1500);

  // 証明書番号
  ctx.font = '40px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#787878';
  ctx.textAlign = 'center';
  ctx.fillText(`証明書番号: ${certificateNumber}`, canvas.width / 2, 1600);

  // 検証コード
  ctx.fillText(`検証コード: ${verificationCode}`, canvas.width / 2, 1680);

  // 署名欄 - 発行元会社名
  ctx.textAlign = 'right';
  ctx.font = 'bold 50px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#323232';
  if (certificateData.issuerCompanyName) {
    console.log('✅ 発行元会社名を描画:', certificateData.issuerCompanyName);
    ctx.fillText(certificateData.issuerCompanyName, 2700, 1750);
  } else {
    console.log('⚠️ 発行元会社名が設定されていません');
  }

  // 署名者役職と氏名
  ctx.font = '42px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#505050';
  if (certificateData.signerTitle && certificateData.signerName) {
    console.log('✅ 署名者役職と氏名を描画:', `${certificateData.signerTitle} ${certificateData.signerName}`);
    ctx.fillText(`${certificateData.signerTitle} ${certificateData.signerName}`, 2700, 1820);
  } else if (certificateData.signerTitle) {
    console.log('✅ 署名者役職を描画:', certificateData.signerTitle);
    ctx.fillText(certificateData.signerTitle, 2700, 1820);
  } else if (certificateData.signerName) {
    console.log('✅ 署名者氏名を描画:', certificateData.signerName);
    ctx.fillText(certificateData.signerName, 2700, 1820);
  } else {
    console.log('⚠️ 署名者情報が設定されていません');
  }

  // 署名欄の線（名前の下）
  ctx.strokeStyle = '#969696';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(2300, 1870);
  ctx.lineTo(2720, 1870);
  ctx.stroke();

  // 装飾的な要素
  ctx.strokeStyle = '#c8b48c';
  ctx.lineWidth = 3;
  // 左上
  ctx.beginPath();
  ctx.moveTo(200, 200);
  ctx.lineTo(300, 200);
  ctx.moveTo(200, 200);
  ctx.lineTo(200, 300);
  ctx.stroke();
  // 右上
  ctx.beginPath();
  ctx.moveTo(2670, 200);
  ctx.lineTo(2770, 200);
  ctx.moveTo(2770, 200);
  ctx.lineTo(2770, 300);
  ctx.stroke();
  // 左下
  ctx.beginPath();
  ctx.moveTo(200, 1850);
  ctx.lineTo(300, 1850);
  ctx.moveTo(200, 1750);
  ctx.lineTo(200, 1850);
  ctx.stroke();
  // 右下
  ctx.beginPath();
  ctx.moveTo(2670, 1850);
  ctx.lineTo(2770, 1850);
  ctx.moveTo(2770, 1750);
  ctx.lineTo(2770, 1850);
  ctx.stroke();

  // 印鑑画像または印鑑を表示
  if (certificateData.stampImageUrl) {
    console.log('✅ 印鑑画像URLが設定されています:', certificateData.stampImageUrl);
    // 印鑑画像を表示
    try {
      const stampImg = new Image();
      stampImg.crossOrigin = 'anonymous';
      console.log('印鑑画像の読み込み開始...');
      await new Promise<void>((resolve, reject) => {
        stampImg.onload = () => {
          console.log('✅ 印鑑画像の読み込み成功');
          // 印鑑画像を署名者名の左に表示
          const stampSize = 180; // 印鑑のサイズ
          const stampX = 2350; // X座標（署名者名の左側）
          const stampY = 1680; // Y座標
          console.log(`印鑑画像を描画: サイズ=${stampSize}px, 位置=(${stampX}, ${stampY})`);
          ctx.drawImage(stampImg, stampX, stampY, stampSize, stampSize);
          resolve();
        };
        stampImg.onerror = (error) => {
          console.error('❌ 印鑑画像の読み込みに失敗しました:', error);
          console.error('画像URL:', certificateData.stampImageUrl);
          resolve(); // エラーでも処理を続行
        };
        stampImg.src = certificateData.stampImageUrl;
      });
      console.log('印鑑画像の処理完了');
    } catch (error) {
      console.error('❌ 印鑑画像の読み込みエラー:', error);
    }
  } else {
    console.log('⚠️ 印鑑画像URLが設定されていません');
  }

  // CanvasをPDFに追加
  console.log('CanvasをPDFに変換中...');
  const imgData = canvas.toDataURL('image/png');
  doc.addImage(imgData, 'PNG', 0, 0, 297, 210);

  // PDFをダウンロード
  const safeCourseName = (certificateData.courseName || 'certificate').replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `certificate_${safeCourseName}_${Date.now()}.pdf`;
  console.log('PDFをダウンロード:', fileName);
  doc.save(fileName);

  console.log('=== 証明書PDF生成完了 ===');

  // 証明書情報を返す（データベースへの保存用）
  return {
    certificateNumber,
    verificationCode,
    doc
  };
}