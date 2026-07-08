'use client';

import { useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import Link from 'next/link';
import {
  QuestionMarkCircleIcon,
  ChevronDownIcon,
  GlobeAltIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

type LangCode = 'ja' | 'en' | 'zh' | 'ko' | 'vi';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqContent {
  title: string;
  subtitle: string;
  contactLabel: string;
  contactText: string;
  items: FaqItem[];
}

const LANGUAGES: { code: LangCode; label: string }[] = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'vi', label: 'Tiếng Việt' },
];

const FAQ_CONTENT: Record<LangCode, FaqContent> = {
  ja: {
    title: 'よくある質問（Q&A）',
    subtitle: '動画の再生・学習の進捗・証明書などについてのよくある質問です。',
    contactLabel: '解決しない場合',
    contactText: '問題が解決しない場合は、サイドメニューの「サポートチャット」からお気軽にお問い合わせください。通常、1営業日以内にご返信いたします。緊急の場合は優先度を「高」または「緊急」に設定してください。',
    items: [
      {
        q: '動画が再生できません',
        a: '以下をご確認ください。\n\n1. iPhone / iPad をお使いの場合、OS（iOS / iPadOS）を最新バージョンにアップデートしてください（設定 → 一般 → ソフトウェアアップデート）。\n2. Wi-Fi環境での視聴を推奨します。通信が不安定な場合は再生が止まることがあります。\n3. 社内ネットワークをご利用の場合、セキュリティフィルタで動画データが遮断されることがあります。別のネットワーク（スマートフォンのモバイル回線など）でお試しください。\n4. ブラウザを最新版に更新し、ページを再読み込みしてください。\n\nそれでも再生できない場合は、サポートチャットからお使いの端末名・OSバージョンを添えてお問い合わせください。',
      },
      {
        q: '動画を最後まで見たのに「完了」になりません',
        a: '動画は既定で95%以上の視聴で完了と判定されます（コースにより異なる場合があります）。\n\n・エンドロールの手前で閉じると完了にならないことがあります。最後まで再生してください。\n・通信の切断により進捗が保存されないことがあります。進捗バーが動いているかご確認ください。\n・完了にならない場合は、該当の動画名を添えてサポートチャットへご連絡ください。管理者側で視聴状況を確認できます。',
      },
      {
        q: '証明書が発行されません',
        a: '証明書はコース内のすべての公開動画を完了すると自動発行されます。\n\n1. マイコースからコースの進捗が100%になっているかご確認ください。\n2. 1本でも「完了」になっていない動画があると発行されません。\n3. すべて完了しているのに発行されない場合は、サポートチャットにコース名を添えてご連絡ください。',
      },
      {
        q: '前回の続きから再生されません',
        a: '視聴位置は自動保存されます。再生ページを開くと前回の位置から再開されます。\n\n・ブラウザのプライベートモードでは保存されないことがあります。\n・異なる端末間でも視聴位置は引き継がれます（同じアカウントでログインしている場合）。',
      },
      {
        q: '早送りやスキップができません',
        a: '学習効果を担保するため、未視聴部分への早送り・スキップは制限されています。\n\n・一度視聴した範囲内であれば自由に戻る・進むが可能です。\n・動画を完了すると、制限は解除され自由にシークできます。',
      },
      {
        q: '音が出ません',
        a: '1. プレイヤーのミュートボタンがオフになっているかご確認ください。\n2. iPhone / iPad では本体側面のサイレントスイッチ・音量ボタンをご確認ください。\n3. Bluetoothイヤホンをご利用の場合は接続状態をご確認ください。',
      },
      {
        q: 'サポートチャットの使い方を教えてください',
        a: 'サイドメニューの「サポートチャット」を開き、「新しい問い合わせ」ボタンから件名と内容を入力して送信してください。\n\n・画像やPDFなどのファイルも添付できます（最大10MB）。\n・返信が届くと、サイドメニューに赤い通知バッジが表示されます。\n・通常、1営業日以内にご返信いたします。',
      },
      {
        q: '推奨環境を教えてください',
        a: '・iPhone / iPad: 最新のiOS / iPadOS ＋ Safari\n・Android: 最新のChrome\n・PC: 最新のChrome / Edge / Safari\n・安定したWi-Fi環境を推奨します。',
      },
    ],
  },
  en: {
    title: 'Frequently Asked Questions (Q&A)',
    subtitle: 'Common questions about video playback, learning progress, and certificates.',
    contactLabel: 'Still need help?',
    contactText: 'If your issue is not resolved, please contact us via "Support Chat" in the side menu. We usually reply within one business day. For urgent matters, set the priority to "High" or "Urgent".',
    items: [
      {
        q: 'The video does not play',
        a: 'Please check the following:\n\n1. On iPhone / iPad, update your OS (iOS / iPadOS) to the latest version (Settings → General → Software Update).\n2. We recommend watching over Wi-Fi. Playback may stop on an unstable connection.\n3. On a corporate network, security filters may block video data. Try another network (e.g. mobile data).\n4. Update your browser to the latest version and reload the page.\n\nIf the video still does not play, contact us via Support Chat with your device model and OS version.',
      },
      {
        q: 'I watched the whole video but it is not marked as completed',
        a: 'A video is normally marked as completed when you have watched 95% or more (this may vary by course).\n\n- Closing the page just before the ending may prevent completion. Please play to the very end.\n- Progress may not be saved if the connection drops. Check that the progress bar is moving.\n- If it still does not complete, contact Support Chat with the video title. Administrators can check your viewing records.',
      },
      {
        q: 'My certificate has not been issued',
        a: 'Certificates are issued automatically when all published videos in a course are completed.\n\n1. Check in My Courses that the course progress shows 100%.\n2. If even one video is not marked "completed", the certificate will not be issued.\n3. If everything is complete but no certificate appears, contact Support Chat with the course name.',
      },
      {
        q: 'Playback does not resume from where I left off',
        a: 'Your viewing position is saved automatically, and playback resumes from your last position.\n\n- It may not be saved in private browsing mode.\n- Your position carries over between devices when logged in with the same account.',
      },
      {
        q: 'I cannot fast-forward or skip',
        a: 'To ensure learning quality, fast-forwarding into unwatched sections is restricted.\n\n- You can freely move within the range you have already watched.\n- Once the video is completed, the restriction is lifted and you can seek freely.',
      },
      {
        q: 'There is no sound',
        a: '1. Check that the player is not muted.\n2. On iPhone / iPad, check the silent switch and volume buttons on the device.\n3. If using Bluetooth earphones, check the connection.',
      },
      {
        q: 'How do I use Support Chat?',
        a: 'Open "Support Chat" from the side menu, press "New Inquiry", enter a subject and message, and send.\n\n- You can attach images and PDFs (max 10MB).\n- When you receive a reply, a red badge appears in the side menu.\n- We usually reply within one business day.',
      },
      {
        q: 'What are the recommended environments?',
        a: '- iPhone / iPad: latest iOS / iPadOS with Safari\n- Android: latest Chrome\n- PC: latest Chrome / Edge / Safari\n- A stable Wi-Fi connection is recommended.',
      },
    ],
  },
  zh: {
    title: '常见问题（Q&A）',
    subtitle: '关于视频播放、学习进度、证书等的常见问题。',
    contactLabel: '问题仍未解决？',
    contactText: '如果问题仍未解决，请通过侧边菜单的「支持聊天（サポートチャット）」联系我们。我们通常会在1个工作日内回复。紧急情况请将优先级设置为「高」或「紧急」。',
    items: [
      {
        q: '视频无法播放',
        a: '请确认以下事项：\n\n1. 使用 iPhone / iPad 时，请将系统（iOS / iPadOS）更新到最新版本（设置 → 通用 → 软件更新）。\n2. 建议在 Wi-Fi 环境下观看。网络不稳定时播放可能会中断。\n3. 使用公司内部网络时，安全过滤器可能会拦截视频数据。请尝试其他网络（如手机流量）。\n4. 请将浏览器更新到最新版本并重新加载页面。\n\n如果仍然无法播放，请通过支持聊天告知您的设备型号和系统版本。',
      },
      {
        q: '视频看完了但没有显示「完成」',
        a: '视频通常在观看95%以上后被判定为完成（因课程而异）。\n\n・在片尾前关闭页面可能导致无法完成，请播放到最后。\n・网络中断可能导致进度未保存，请确认进度条是否在移动。\n・如果仍未完成，请附上视频名称联系支持聊天，管理员可以查看您的观看记录。',
      },
      {
        q: '证书没有发放',
        a: '完成课程内所有公开视频后，证书将自动发放。\n\n1. 请在「我的课程」中确认课程进度是否为100%。\n2. 只要有一个视频未「完成」，证书就不会发放。\n3. 如果全部完成但仍未发放，请附上课程名称联系支持聊天。',
      },
      {
        q: '无法从上次的位置继续播放',
        a: '观看位置会自动保存，打开播放页面后会从上次的位置继续。\n\n・浏览器的隐私模式下可能无法保存。\n・使用同一账号登录时，观看位置可在不同设备间同步。',
      },
      {
        q: '无法快进或跳过',
        a: '为保证学习效果，禁止快进到未观看的部分。\n\n・在已观看的范围内可以自由前进和后退。\n・视频完成后，限制将解除，可以自由拖动进度条。',
      },
      {
        q: '没有声音',
        a: '1. 请确认播放器的静音按钮是否已关闭。\n2. iPhone / iPad 请检查机身侧面的静音开关和音量按钮。\n3. 使用蓝牙耳机时请确认连接状态。',
      },
      {
        q: '如何使用支持聊天？',
        a: '打开侧边菜单的「支持聊天」，点击「新建咨询」按钮，输入主题和内容后发送。\n\n・可以附加图片、PDF等文件（最大10MB）。\n・收到回复时，侧边菜单会显示红色通知标记。\n・通常会在1个工作日内回复。',
      },
      {
        q: '推荐的使用环境是什么？',
        a: '・iPhone / iPad: 最新的 iOS / iPadOS + Safari\n・Android: 最新的 Chrome\n・电脑: 最新的 Chrome / Edge / Safari\n・建议使用稳定的 Wi-Fi 环境。',
      },
    ],
  },
  ko: {
    title: '자주 묻는 질문 (Q&A)',
    subtitle: '동영상 재생, 학습 진도, 수료증 등에 관한 자주 묻는 질문입니다.',
    contactLabel: '문제가 해결되지 않았나요?',
    contactText: '문제가 해결되지 않는 경우, 사이드 메뉴의 「서포트 채팅(サポートチャット)」으로 문의해 주세요. 보통 1영업일 이내에 답변드립니다. 긴급한 경우 우선순위를 「높음」 또는 「긴급」으로 설정해 주세요.',
    items: [
      {
        q: '동영상이 재생되지 않습니다',
        a: '다음을 확인해 주세요.\n\n1. iPhone / iPad를 사용하시는 경우, OS(iOS / iPadOS)를 최신 버전으로 업데이트해 주세요 (설정 → 일반 → 소프트웨어 업데이트).\n2. Wi-Fi 환경에서의 시청을 권장합니다. 통신이 불안정하면 재생이 멈출 수 있습니다.\n3. 사내 네트워크를 이용하시는 경우, 보안 필터가 동영상 데이터를 차단할 수 있습니다. 다른 네트워크(모바일 데이터 등)로 시도해 주세요.\n4. 브라우저를 최신 버전으로 업데이트하고 페이지를 새로고침해 주세요.\n\n그래도 재생되지 않으면 서포트 채팅으로 기기명과 OS 버전을 알려주세요.',
      },
      {
        q: '동영상을 끝까지 봤는데 「완료」가 되지 않습니다',
        a: '동영상은 기본적으로 95% 이상 시청 시 완료로 판정됩니다 (코스에 따라 다를 수 있음).\n\n・엔딩 직전에 페이지를 닫으면 완료되지 않을 수 있습니다. 끝까지 재생해 주세요.\n・통신 끊김으로 진도가 저장되지 않을 수 있습니다. 진행 바가 움직이는지 확인해 주세요.\n・완료되지 않는 경우, 해당 동영상 이름과 함께 서포트 채팅으로 연락해 주세요. 관리자가 시청 기록을 확인할 수 있습니다.',
      },
      {
        q: '수료증이 발급되지 않습니다',
        a: '수료증은 코스 내 모든 공개 동영상을 완료하면 자동 발급됩니다.\n\n1. 마이 코스에서 코스 진도가 100%인지 확인해 주세요.\n2. 한 개라도 「완료」되지 않은 동영상이 있으면 발급되지 않습니다.\n3. 모두 완료했는데도 발급되지 않으면 코스명과 함께 서포트 채팅으로 연락해 주세요.',
      },
      {
        q: '지난번 이어보기가 되지 않습니다',
        a: '시청 위치는 자동 저장되며, 재생 페이지를 열면 지난 위치에서 재개됩니다.\n\n・브라우저의 시크릿 모드에서는 저장되지 않을 수 있습니다.\n・같은 계정으로 로그인하면 다른 기기 간에도 시청 위치가 이어집니다.',
      },
      {
        q: '빨리 감기나 건너뛰기가 안 됩니다',
        a: '학습 효과를 보장하기 위해 미시청 구간으로의 빨리 감기는 제한됩니다.\n\n・이미 시청한 범위 내에서는 자유롭게 이동할 수 있습니다.\n・동영상을 완료하면 제한이 해제되어 자유롭게 이동할 수 있습니다.',
      },
      {
        q: '소리가 나지 않습니다',
        a: '1. 플레이어의 음소거 버튼이 꺼져 있는지 확인해 주세요.\n2. iPhone / iPad는 본체 측면의 무음 스위치와 음량 버튼을 확인해 주세요.\n3. 블루투스 이어폰 사용 시 연결 상태를 확인해 주세요.',
      },
      {
        q: '서포트 채팅 사용법을 알려주세요',
        a: '사이드 메뉴의 「서포트 채팅」을 열고, 「새 문의」 버튼에서 제목과 내용을 입력해 전송해 주세요.\n\n・이미지나 PDF 등의 파일도 첨부할 수 있습니다 (최대 10MB).\n・답변이 도착하면 사이드 메뉴에 빨간 알림 배지가 표시됩니다.\n・보통 1영업일 이내에 답변드립니다.',
      },
      {
        q: '권장 환경을 알려주세요',
        a: '・iPhone / iPad: 최신 iOS / iPadOS + Safari\n・Android: 최신 Chrome\n・PC: 최신 Chrome / Edge / Safari\n・안정적인 Wi-Fi 환경을 권장합니다.',
      },
    ],
  },
  vi: {
    title: 'Câu hỏi thường gặp (Q&A)',
    subtitle: 'Các câu hỏi thường gặp về phát video, tiến độ học tập và chứng chỉ.',
    contactLabel: 'Vẫn chưa giải quyết được?',
    contactText: 'Nếu vấn đề chưa được giải quyết, vui lòng liên hệ qua「Chat hỗ trợ (サポートチャット)」ở menu bên. Chúng tôi thường trả lời trong vòng 1 ngày làm việc. Trường hợp khẩn cấp, hãy đặt mức độ ưu tiên là「Cao」hoặc「Khẩn cấp」.',
    items: [
      {
        q: 'Video không phát được',
        a: 'Vui lòng kiểm tra những điều sau:\n\n1. Nếu dùng iPhone / iPad, hãy cập nhật hệ điều hành (iOS / iPadOS) lên phiên bản mới nhất (Cài đặt → Cài đặt chung → Cập nhật phần mềm).\n2. Nên xem qua Wi-Fi. Kết nối không ổn định có thể làm video bị dừng.\n3. Nếu dùng mạng công ty, bộ lọc bảo mật có thể chặn dữ liệu video. Hãy thử mạng khác (ví dụ: dữ liệu di động).\n4. Cập nhật trình duyệt lên phiên bản mới nhất và tải lại trang.\n\nNếu vẫn không phát được, hãy liên hệ qua Chat hỗ trợ kèm tên thiết bị và phiên bản hệ điều hành.',
      },
      {
        q: 'Đã xem hết video nhưng không được đánh dấu「Hoàn thành」',
        a: 'Video thường được tính là hoàn thành khi xem từ 95% trở lên (có thể khác nhau tùy khóa học).\n\n- Đóng trang ngay trước phần kết có thể khiến video không hoàn thành. Hãy phát đến hết.\n- Mất kết nối có thể khiến tiến độ không được lưu. Hãy kiểm tra thanh tiến độ có chạy không.\n- Nếu vẫn không hoàn thành, hãy liên hệ Chat hỗ trợ kèm tên video. Quản trị viên có thể kiểm tra lịch sử xem của bạn.',
      },
      {
        q: 'Chứng chỉ chưa được cấp',
        a: 'Chứng chỉ được cấp tự động khi hoàn thành tất cả video công khai trong khóa học.\n\n1. Kiểm tra tiến độ khóa học đã đạt 100% trong「Khóa học của tôi」chưa.\n2. Chỉ cần một video chưa「hoàn thành」thì chứng chỉ sẽ không được cấp.\n3. Nếu đã hoàn thành tất cả mà vẫn chưa có chứng chỉ, hãy liên hệ Chat hỗ trợ kèm tên khóa học.',
      },
      {
        q: 'Không phát tiếp từ vị trí lần trước',
        a: 'Vị trí xem được lưu tự động, khi mở trang phát video sẽ tiếp tục từ vị trí lần trước.\n\n- Chế độ duyệt web riêng tư có thể không lưu được.\n- Vị trí xem được đồng bộ giữa các thiết bị khi đăng nhập cùng một tài khoản.',
      },
      {
        q: 'Không tua nhanh hoặc bỏ qua được',
        a: 'Để đảm bảo hiệu quả học tập, việc tua nhanh đến phần chưa xem bị hạn chế.\n\n- Bạn có thể di chuyển tự do trong phạm vi đã xem.\n- Sau khi hoàn thành video, hạn chế sẽ được gỡ bỏ và bạn có thể tua tự do.',
      },
      {
        q: 'Không có âm thanh',
        a: '1. Kiểm tra nút tắt tiếng của trình phát đã tắt chưa.\n2. Với iPhone / iPad, kiểm tra công tắc im lặng và nút âm lượng bên cạnh máy.\n3. Nếu dùng tai nghe Bluetooth, kiểm tra trạng thái kết nối.',
      },
      {
        q: 'Cách sử dụng Chat hỗ trợ',
        a: 'Mở「Chat hỗ trợ」từ menu bên, nhấn nút「Tạo yêu cầu mới」, nhập tiêu đề và nội dung rồi gửi.\n\n- Có thể đính kèm hình ảnh, PDF, v.v. (tối đa 10MB).\n- Khi có trả lời, huy hiệu thông báo màu đỏ sẽ hiển thị ở menu bên.\n- Chúng tôi thường trả lời trong vòng 1 ngày làm việc.',
      },
      {
        q: 'Môi trường khuyến nghị là gì?',
        a: '- iPhone / iPad: iOS / iPadOS mới nhất + Safari\n- Android: Chrome mới nhất\n- PC: Chrome / Edge / Safari mới nhất\n- Khuyến nghị sử dụng Wi-Fi ổn định.',
      },
    ],
  },
};

export default function FaqPage() {
  const [lang, setLang] = useState<LangCode>('ja');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const content = FAQ_CONTENT[lang];

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="mb-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center mr-4">
                <QuestionMarkCircleIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{content.title}</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">{content.subtitle}</p>
              </div>
            </div>
          </div>

          {/* 言語切り替え */}
          <div className="mb-6 flex items-center gap-2 flex-wrap">
            <GlobeAltIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
            {LANGUAGES.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => {
                  setLang(code);
                  setOpenIndex(0);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  lang === code
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* FAQアコーディオン */}
          <div className="space-y-3 mb-8">
            {content.items.map((item, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={`${lang}-${index}`}
                  className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
                      Q. {item.q}
                    </span>
                    <ChevronDownIcon
                      className={`h-5 w-5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-neutral-800">
                      <p className="pt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* サポートチャットへの誘導 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <ChatBubbleLeftRightIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
                  {content.contactLabel}
                </h3>
                <p className="text-sm text-blue-800 dark:text-blue-300 break-words mb-3">
                  {content.contactText}
                </p>
                <Link
                  href="/messages"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <ChatBubbleLeftRightIcon className="h-4 w-4 mr-2" />
                  {lang === 'ja' ? 'サポートチャットを開く'
                    : lang === 'en' ? 'Open Support Chat'
                    : lang === 'zh' ? '打开支持聊天'
                    : lang === 'ko' ? '서포트 채팅 열기'
                    : 'Mở Chat hỗ trợ'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
