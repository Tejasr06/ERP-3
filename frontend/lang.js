(function () {
  const SUPPORTED_LANGUAGES = ['en', 'hi', 'ta', 'te', 'kn'];

  const translations = {
    en: {
      'app.title.login': 'EduConnect — Login',
      'app.title.forgot': 'EduConnect — Forgot Password',
      'app.title.setPassword': 'EduConnect — Set Password',
      'app.title.dashboard': 'EduConnect — Dashboard',
      'app.title.admin': 'EduConnect — Admin Panel',
      'common.language': 'Language',
      'common.parent': 'Parent',
      'common.signOut': 'Sign Out',
      'common.dashboard': 'Dashboard',
      'common.attendance': 'Attendance',
      'common.marks': 'Marks & Grades',
      'common.fees': 'Fee Status',
      'common.reportCard': 'Report Card',
      'common.overview': 'Overview',
      'common.academics': 'Academics',
      'common.finance': 'Finance',
      'common.reports': 'Reports',
      'auth.brandSub': 'connecting education',
      'auth.schoolName': 'SRI SAIRAM INTERNATIONAL SCHOOL',
      'auth.subHeading': 'Sign in with your school credentials.',
      'auth.staff': 'Staff',
      'auth.parentLabel': 'Parent',
      'auth.username': 'Username or email',
      'auth.usernamePlaceholder': 'Username or email',
      'auth.password': 'Password',
      'auth.passwordPlaceholder': 'Password',
      'auth.remember': 'Remember?',
      'auth.forgot': 'Forgot your password?',
      'auth.login': 'Login',
      'auth.signin': 'Login',
      'auth.signingIn': 'Signing in…',
      'auth.enterCredentials': 'Please enter your username and password.',
      'auth.loginButtonUnavailable': 'Login button is not available. Please reload the page.',
      'auth.loginFailed': 'Login failed.',
      'auth.serverUnavailable': 'Cannot connect to server. Is the backend running?',
      'auth.focusNote': 'Use your school-issued username and password to access the portal.',
      'auth.forgotTitle': 'Forgot Password?',
      'auth.forgotSub': 'Enter your registered email and we\'ll send you a reset link.',
      'auth.emailAddress': 'Email Address',
      'auth.emailPlaceholder': 'your@email.com',
      'auth.sendReset': 'Send Reset Link',
      'auth.sending': 'Sending…',
      'auth.backToLogin': 'Back to Login',
      'auth.enterEmail': 'Please enter your email.',
      'auth.resetLinkSent': 'Reset link sent!',
      'auth.resetUnavailable': 'Cannot connect to server.',
      'auth.setPasswordTitle': 'Set Your Password',
      'auth.setPasswordSub': 'Enter the setup token from your welcome email, then create a secure password for your account.',
      'auth.setupToken': 'Setup Token (from email)',
      'auth.setupTokenPlaceholder': 'Paste token from email…',
      'auth.newPassword': 'New Password',
      'auth.newPasswordPlaceholder': 'Minimum 6 characters',
      'auth.confirmPassword': 'Confirm Password',
      'auth.confirmPasswordPlaceholder': 'Repeat password',
      'auth.ruleMin': 'At least 6 characters',
      'auth.ruleNumber': 'Contains a number',
      'auth.ruleMatch': 'Passwords match',
      'auth.setPassword': 'Set Password',
      'auth.settingPassword': 'Setting password…',
      'auth.enterToken': 'Please enter the setup token from your email.',
      'auth.passwordTooShort': 'Password must be at least 6 characters.',
      'auth.passwordMismatch': 'Passwords do not match.',
      'auth.passwordSet': 'Password set! Redirecting to login…',
      'auth.passwordSetFailed': 'Failed.',
      'auth.passwordConnectError': 'Cannot connect to server.',
      'dashboard.topbarTitle': 'Dashboard',
      'dashboard.attendanceWarning': 'Attendance Warning! Your child\'s attendance is below 75%. An email alert has been sent to you.',
      'dashboard.attendancePanel': 'Attendance',
      'dashboard.minimumRequired': 'Minimum required:',
      'dashboard.loading': 'Loading…',
      'dashboard.attendanceOverview': 'Attendance Overview',
      'dashboard.adminPanel': 'Admin Panel',
      'dashboard.importStudents': 'Import Students',
      'dashboard.importMarks': 'Import Marks',
      'dashboard.allStudents': 'All Students',
      'dashboard.manageMarks': 'Manage Marks',
      'dashboard.feeRecords': 'Fee Records',
      'dashboard.contactParent': 'Contact Parent',
      'dashboard.sendNotifications': 'Send Notifications',
      'dashboard.parentPortal': 'Parent Portal'
    },
    hi: {
      'app.title.login': 'एडुकनेक्ट — लॉगिन',
      'app.title.forgot': 'एडुकनेक्ट — पासवर्ड भूल गए',
      'app.title.setPassword': 'एडुकनेक्ट — पासवर्ड सेट करें',
      'app.title.dashboard': 'एडुकनेक्ट — डैशबोर्ड',
      'app.title.admin': 'एडुकनेक्ट — एडमिन पैनल',
      'common.language': 'भाषा',
      'common.parent': 'अभिभावक',
      'common.signOut': 'साइन आउट',
      'common.dashboard': 'डैशबोर्ड',
      'common.attendance': 'उपस्थिति',
      'common.marks': 'अंक और ग्रेड',
      'common.fees': 'शुल्क स्थिति',
      'common.reportCard': 'रिपोर्ट कार्ड',
      'common.overview': 'अवलोकन',
      'common.academics': 'शैक्षणिक',
      'common.finance': 'वित्त',
      'common.reports': 'रिपोर्ट्स',
      'auth.brandSub': 'शिक्षा को जोड़ना',
      'auth.schoolName': 'एसआरआई साईंराम इंटरनेशनल स्कूल',
      'auth.subHeading': 'अपने स्कूल क्रेडेंशियल से साइन इन करें।',
      'auth.staff': 'स्टाफ',
      'auth.parentLabel': 'अभिभावक',
      'auth.username': 'उपयोगकर्ता नाम या ईमेल',
      'auth.usernamePlaceholder': 'उपयोगकर्ता नाम या ईमेल',
      'auth.password': 'पासवर्ड',
      'auth.passwordPlaceholder': 'पासवर्ड',
      'auth.remember': 'याद रखें?',
      'auth.forgot': 'पासवर्ड भूल गए?',
      'auth.login': 'लॉगिन',
      'auth.signin': 'लॉगिन',
      'auth.signingIn': 'साइन इन हो रहा है…',
      'auth.enterCredentials': 'कृपया अपना उपयोगकर्ता नाम और पासवर्ड दर्ज करें।',
      'auth.loginButtonUnavailable': 'लॉगिन बटन उपलब्ध नहीं है। कृपया पेज फिर से खोलें।',
      'auth.loginFailed': 'लॉगिन विफल।',
      'auth.serverUnavailable': 'सर्वर से कनेक्ट नहीं हो पा रहा है। क्या बैकएंड चल रहा है?',
      'auth.focusNote': 'पोर्टल तक पहुँचने के लिए अपने स्कूल-issued उपयोगकर्ता नाम और पासवर्ड का उपयोग करें।',
      'auth.forgotTitle': 'पासवर्ड भूल गए?',
      'auth.forgotSub': 'अपना पंजीकृत ईमेल दर्ज करें और हम आपको रिसेट लिंक भेजेंगे।',
      'auth.emailAddress': 'ईमेल पता',
      'auth.emailPlaceholder': 'your@email.com',
      'auth.sendReset': 'रीसेट लिंक भेजें',
      'auth.sending': 'भेजा जा रहा है…',
      'auth.backToLogin': 'लॉगिन पर वापस',
      'auth.enterEmail': 'कृपया अपना ईमेल दर्ज करें।',
      'auth.resetLinkSent': 'रीसेट लिंक भेज दिया गया!',
      'auth.resetUnavailable': 'सर्वर से कनेक्ट नहीं हो पा रहा है।',
      'auth.setPasswordTitle': 'अपना पासवर्ड सेट करें',
      'auth.setPasswordSub': 'अपने वेलकम ईमेल से सेटअप टोकन दर्ज करें और अपना सुरक्षित पासवर्ड बनाएँ।',
      'auth.setupToken': 'सेटअप टोकन (ईमेल से)',
      'auth.setupTokenPlaceholder': 'ईमेल से टोकन पेस्ट करें…',
      'auth.newPassword': 'नया पासवर्ड',
      'auth.newPasswordPlaceholder': 'न्यूनतम 6 अक्षर',
      'auth.confirmPassword': 'पासवर्ड की पुष्टि करें',
      'auth.confirmPasswordPlaceholder': 'पासवर्ड फिर से दर्ज करें',
      'auth.ruleMin': 'कम से कम 6 अक्षर',
      'auth.ruleNumber': 'एक नंबर हो',
      'auth.ruleMatch': 'पासवर्ड मेल खाते हैं',
      'auth.setPassword': 'पासवर्ड सेट करें',
      'auth.settingPassword': 'पासवर्ड सेट किया जा रहा है…',
      'auth.enterToken': 'कृपया अपने ईमेल से सेटअप टोकन दर्ज करें।',
      'auth.passwordTooShort': 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।',
      'auth.passwordMismatch': 'पासवर्ड मेल नहीं खाते।',
      'auth.passwordSet': 'पासवर्ड सेट हो गया! लॉगिन पर रीडायरेक्ट हो रहा है…',
      'auth.passwordSetFailed': 'विफल।',
      'auth.passwordConnectError': 'सर्वर से कनेक्ट नहीं हो पा रहा है।',
      'dashboard.topbarTitle': 'डैशबोर्ड',
      'dashboard.attendanceWarning': 'उपस्थिति चेतावनी! आपके बच्चे की उपस्थिति 75% से कम है। आपको एक ईमेल अलर्ट भेज दिया गया है।',
      'dashboard.attendancePanel': 'उपस्थिति',
      'dashboard.minimumRequired': 'न्यूनतम आवश्यक:',
      'dashboard.loading': 'लोड हो रहा है…',
      'dashboard.attendanceOverview': 'उपस्थिति अवलोकन',
      'dashboard.adminPanel': 'एडमिन पैनल',
      'dashboard.importStudents': 'छात्र आयात करें',
      'dashboard.importMarks': 'अंक आयात करें',
      'dashboard.allStudents': 'सारे छात्र',
      'dashboard.manageMarks': 'अंक प्रबंधित करें',
      'dashboard.feeRecords': 'शुल्क रिकॉर्ड',
      'dashboard.contactParent': 'अभिभावक से संपर्क करें',
      'dashboard.sendNotifications': 'सूचनाएँ भेजें',
      'dashboard.parentPortal': 'अभिभावक पोर्टल'
    },
    ta: {
      'app.title.login': 'எடுகனெக்ட் — உள்நுழைவு',
      'app.title.forgot': 'எடுகனெக்ட் — கடவுச்சொல் மறந்துவிட்டது',
      'app.title.setPassword': 'எடுகனெக்ட் — கடவுச்சொல்லை அமை',
      'app.title.dashboard': 'எடுகனெக்ட் — டாஷ்போர்டு',
      'app.title.admin': 'எடுகனெக்ட் — நிர்வாகப் பலகம்',
      'common.language': 'மொழி',
      'common.parent': 'பெற்றோர்',
      'common.signOut': 'வெளியேறு',
      'common.dashboard': 'டாஷ்போர்டு',
      'common.attendance': 'வருகை',
      'common.marks': 'மதிப்பெண்கள் மற்றும் தரங்கள்',
      'common.fees': 'கட்டண நிலை',
      'common.reportCard': 'அறிக்கை அட்டை',
      'common.overview': 'கண்ணோட்டம்',
      'common.academics': 'கல்வி',
      'common.finance': 'நிதி',
      'common.reports': 'அறிக்கைகள்',
      'auth.brandSub': 'கல்வியை இணைத்தல்',
      'auth.schoolName': 'எஸ்ஆர்ஐ சைராம் இன்டர்நேஷனல் பள்ளி',
      'auth.subHeading': 'உங்கள் பள்ளி சான்றுகளுடன் உள்நுழைக.',
      'auth.staff': 'பணி ஊழியர்',
      'auth.parentLabel': 'பெற்றோர்',
      'auth.username': 'பயனர்பெயர் அல்லது மின்னஞ்சல்',
      'auth.usernamePlaceholder': 'பயனர்பெயர் அல்லது மின்னஞ்சல்',
      'auth.password': 'கடவுச்சொல்',
      'auth.passwordPlaceholder': 'கடவுச்சொல்',
      'auth.remember': 'நினைவில் வையா?',
      'auth.forgot': 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?',
      'auth.login': 'உள்நுழை',
      'auth.signin': 'உள்நுழை',
      'auth.signingIn': 'உள்நுழைகிறோம்…',
      'auth.enterCredentials': 'தயவுசெய்து உங்கள் பயனர்பெயரையும் கடவுச்சொல்லையும் உள்ளிடவும்.',
      'auth.loginButtonUnavailable': 'உள்நுழை பொத்தான் கிடைக்கவில்லை. மீண்டும் ஏற்றவும்.',
      'auth.loginFailed': 'உள்நுழைவு தோல்வியடைந்தது.',
      'auth.serverUnavailable': 'சர்வருடன் இணைக்க முடியவில்லை. பின்புலம் இயங்குகிறதா?',
      'auth.focusNote': 'போர்ட்டலை அணுக உங்கள் பள்ளி வழங்கிய பயனர்பெயர் மற்றும் கடவுச்சொல்லைப் பயன்படுத்தவும்.',
      'auth.forgotTitle': 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?',
      'auth.forgotSub': 'உங்கள் பதிவு செய்த மின்னஞ்சலை உள்ளிடவும்; நாங்கள் மீட்டமைப்பு இணைப்பை அனுப்புவோம்.',
      'auth.emailAddress': 'மின்னஞ்சல் முகவரி',
      'auth.emailPlaceholder': 'your@email.com',
      'auth.sendReset': 'மீட்டமை இணைப்பை அனுப்பு',
      'auth.sending': 'அனுப்புகிறோம்…',
      'auth.backToLogin': 'உள்நுழைவு பக்கத்திற்குத் திரும்பு',
      'auth.enterEmail': 'தயவுசெய்து உங்கள் மின்னஞ்சலை உள்ளிடவும்.',
      'auth.resetLinkSent': 'மீட்டமைப்பு இணைப்பு அனுப்பப்பட்டது!',
      'auth.resetUnavailable': 'சர்வருடன் இணைக்க முடியவில்லை.',
      'auth.setPasswordTitle': 'உங்கள் கடவுச்சொல்லை அமைக்கவும்',
      'auth.setPasswordSub': 'உங்கள் வரவேற்பு மின்னஞ்சலில் உள்ள அமைவு குறியீட்டை உள்ளிட்டு, பாதுகாப்பான கடவுச்சொல்லை உருவாக்கவும்.',
      'auth.setupToken': 'அமைவு குறியீடு (மின்னஞ்சலில்)',
      'auth.setupTokenPlaceholder': 'மின்னஞ்சலில் இருந்து குறியீட்டை ஒட்டு…',
      'auth.newPassword': 'புதிய கடவுச்சொல்',
      'auth.newPasswordPlaceholder': 'குறைந்தது 6 எழுத்துகள்',
      'auth.confirmPassword': 'கடவுச்சொல்லை உறுதிப்படுத்து',
      'auth.confirmPasswordPlaceholder': 'கடவுச்சொல்லை மீண்டும் உள்ளிடவும்',
      'auth.ruleMin': 'குறைந்தது 6 எழுத்துகள்',
      'auth.ruleNumber': 'ஒரு எண் இருக்க வேண்டும்',
      'auth.ruleMatch': 'கடவுச்சொற்கள் பொருந்துகின்றன',
      'auth.setPassword': 'கடவுச்சொல்லை அமை',
      'auth.settingPassword': 'கடவுச்சொல் அமைக்கப்படுகிறது…',
      'auth.enterToken': 'தயவுசெய்து உங்கள் மின்னஞ்சலில் இருந்து அமைவு குறியீட்டை உள்ளிடவும்.',
      'auth.passwordTooShort': 'கடவுச்சொல் குறைந்தது 6 எழுத்துகள் இருக்க வேண்டும்.',
      'auth.passwordMismatch': 'கடவுச்சொற்கள் பொருந்தவில்லை.',
      'auth.passwordSet': 'கடவுச்சொல் அமைக்கப்பட்டது! உள்நுழைவுக்கு திருப்பி விடுகிறோம்…',
      'auth.passwordSetFailed': 'தோல்வியடைந்தது.',
      'auth.passwordConnectError': 'சர்வருடன் இணைக்க முடியவில்லை.',
      'dashboard.topbarTitle': 'டாஷ்போர்டு',
      'dashboard.attendanceWarning': 'வருகை எச்சரிக்கை! உங்கள் பிள்ளையின் வருகை 75% க்கும் குறைவாக உள்ளது. உங்களுக்குப் புகார் மின்னஞ்சல் அனுப்பப்பட்டுள்ளது.',
      'dashboard.attendancePanel': 'வருகை',
      'dashboard.minimumRequired': 'குறைந்தபட்ச தேவை:',
      'dashboard.loading': 'ஏற்றப்படுகிறது…',
      'dashboard.attendanceOverview': 'வருகை கண்ணோட்டம்',
      'dashboard.adminPanel': 'நிர்வாகப் பலகம்',
      'dashboard.importStudents': 'மாணவர்களை இறக்குமதி செய்',
      'dashboard.importMarks': 'மதிப்பெண்களை இறக்குமதி செய்',
      'dashboard.allStudents': 'அனைத்து மாணவர்களும்',
      'dashboard.manageMarks': 'மதிப்பெண்களை நிர்வகி',
      'dashboard.feeRecords': 'கட்டண பதிவுகள்',
      'dashboard.contactParent': 'பெற்றோருடன் தொடர்பு',
      'dashboard.sendNotifications': 'அறிவிப்புகளை அனுப்பு',
      'dashboard.parentPortal': 'பெற்றோர் போர்டல்'
    },
    te: {
      'app.title.login': 'ఎడ్యూకనెక్ట్ — లాగిన్',
      'app.title.forgot': 'ఎడ్యూకనెక్ట్ — పాస్వర్డ్ మరిచిపోయారు',
      'app.title.setPassword': 'ఎడ్యూకనెక్ట్ — పాస్వర్డ్ను సెట్ చేయండి',
      'app.title.dashboard': 'ఎడ్యూకనెక్ట్ — డాష్బోర్డ్',
      'app.title.admin': 'ఎడ్యూకనెక్ట్ — అడ్మిన్ ప్యానల్',
      'common.language': 'భాష',
      'common.parent': 'అభివృద్ధి చేస్తున్నవారు',
      'common.signOut': 'సైన్ అవుట్',
      'common.dashboard': 'డాష్బోర్డ్',
      'common.attendance': 'హాజరు',
      'common.marks': 'మార్కులు మరియు గ్రేడ్లు',
      'common.fees': 'ఫీజు స్థితి',
      'common.reportCard': 'రిపోర్ట్ కార్డు',
      'common.overview': 'అవలోకనం',
      'common.academics': 'అకడమిక్స్',
      'common.finance': 'ఆర్ధికం',
      'common.reports': 'రిపోర్ట్స్',
      'auth.brandSub': 'విద్యను కలుపుతోంది',
      'auth.schoolName': 'ఎస్.ఆర్.ఐ. సైరామ్ ఇంటర్నేషనల్ స్కూల్',
      'auth.subHeading': 'మీ పాఠశాల క్రెడెన్షియల్స్‌తో లాగిన్ అవ్వండి.',
      'auth.staff': 'స్టాఫ్',
      'auth.parentLabel': 'తల్లిదండ్రి',
      'auth.username': 'వినియోగదారు పేరు లేదా ఇమెయిల్',
      'auth.usernamePlaceholder': 'వినియోగదారు పేరు లేదా ఇమెయిల్',
      'auth.password': 'పాస్వర్డ్',
      'auth.passwordPlaceholder': 'పాస్వర్డ్',
      'auth.remember': 'గుర్తుంచుకోండి?',
      'auth.forgot': 'పాస్వర్డ్ని మర్చిపోయారా?',
      'auth.login': 'లాగిన్',
      'auth.signin': 'లాగిన్',
      'auth.signingIn': 'లాగిన్ అవుతున్నాం…',
      'auth.enterCredentials': 'దయచేసి మీ వినియోగదారు పేరు మరియు పాస్వర్డ్ని నమోదు చేయండి.',
      'auth.loginButtonUnavailable': 'లాగిన్ బటన్ అందుబాటులో లేదు. దయచేసి పేజీని మళ్లీ లోడ్ చేయండి.',
      'auth.loginFailed': 'లాగిన్ విఫలమైంది.',
      'auth.serverUnavailable': 'సర్వర్తో కనెక్ట్ కాలేకపోయాము. బ్యాక్ఎండ్ నడుస్తున్నదా?',
      'auth.focusNote': 'పోర్టల్ని ఉపయోగించడానికి మీ పాఠశాల ఇస్తున్న వినియోగదారు పేరు మరియు పాస్వర్డ్ని ఉపయోగించండి.',
      'auth.forgotTitle': 'పాస్వర్డ్ మరిచిపోయారా?',
      'auth.forgotSub': 'మీ రిజిస్టర్ చేసిన ఇమెయిల్ను నమోదు చేయండి; మేము రీసెట్ లింక్ని పంపుతాము.',
      'auth.emailAddress': 'ఇమెయిల్ చిరునామా',
      'auth.emailPlaceholder': 'your@email.com',
      'auth.sendReset': 'రీసెట్ లింక్ పంపు',
      'auth.sending': 'పంపుతున్నారు…',
      'auth.backToLogin': 'లాగిన్ పేజీకి తిరిగి వెళ్ళు',
      'auth.enterEmail': 'దయచేసి మీ ఇమెయిల్ను నమోదు చేయండి.',
      'auth.resetLinkSent': 'రీసెట్ లింక్ పంపబడింది!',
      'auth.resetUnavailable': 'సర్వర్తో కనెక్ట్ కాలేకపోయాము.',
      'auth.setPasswordTitle': 'మీ పాస్వర్డ్ని సెట్ చేయండి',
      'auth.setPasswordSub': 'మీ స్వాగత ఇమెయిల్‌లో ఉన్న సెటప్ టోకన్‌ను నమోదు చేసి, భద్రమైన పాస్వర్డ్ని సృష్టించండి.',
      'auth.setupToken': 'సెటప్ టోకెన్ (ఇమెయిల్ నుండి)',
      'auth.setupTokenPlaceholder': 'ఇమెయిల్ నుండి టోకన్ పేస్ట్ చేయండి…',
      'auth.newPassword': 'కొత్త పాస్వర్డ్',
      'auth.newPasswordPlaceholder': 'కనీసం 6 అక్షరాలు',
      'auth.confirmPassword': 'పాస్వర్డ్ని ధృవీకరించండి',
      'auth.confirmPasswordPlaceholder': 'పాస్వర్డ్ని మళ్లీ నమోదు చేయండి',
      'auth.ruleMin': 'కనీసం 6 అక్షరాలు',
      'auth.ruleNumber': 'ఒక సంఖ్య ఉంది',
      'auth.ruleMatch': 'పాస్వర్డ్లు సరిపోతున్నాయి',
      'auth.setPassword': 'పాస్వర్డ్ని సెట్ చేయండి',
      'auth.settingPassword': 'పాస్వర్డ్ని సెట్ చేస్తోంది…',
      'auth.enterToken': 'దయచేసి మీ ఇమెయిల్‌లో ఉన్న సెటప్ టోకన్‌ను నమోదు చేయండి.',
      'auth.passwordTooShort': 'పాస్వర్డ్ కనీసం 6 అక్షరాలు ఉండాలి.',
      'auth.passwordMismatch': 'పాస్వర్డ్లు సరిపోలడం లేదు.',
      'auth.passwordSet': 'పాస్వర్డ్ సెట్ అయ్యింది! లాగిన్‌కు మళ్లీ తీసుకువెళ్తున్నాం…',
      'auth.passwordSetFailed': 'విఫలమైంది.',
      'auth.passwordConnectError': 'సర్వర్తో కనెక్ట్ కాలేకపోయాము.',
      'dashboard.topbarTitle': 'డాష్బోర్డ్',
      'dashboard.attendanceWarning': 'హాజరు హెచ్చరిక! మీ పిల్లవాడు హాజరు 75% కంటే తక్కువగా ఉంది. మీకు ఇమెయిల్ అలర్ట్ పంపబడింది.',
      'dashboard.attendancePanel': 'హాజరు',
      'dashboard.minimumRequired': 'కనీస అవసరం:',
      'dashboard.loading': 'లోడ్ అవుతోంది…',
      'dashboard.attendanceOverview': 'హాజరు అవలోకనం',
      'dashboard.adminPanel': 'అడ్మిన్ ప్యానల్',
      'dashboard.importStudents': 'విద్యార్థులను దిగుమతి చేయండి',
      'dashboard.importMarks': 'మార్కులను దిగుమతి చేయండి',
      'dashboard.allStudents': 'అన్ని విద్యార్థులు',
      'dashboard.manageMarks': 'మార్కులను నిర్వహించండి',
      'dashboard.feeRecords': 'ఫీజు రికార్డులు',
      'dashboard.contactParent': 'తల్లిదండ్రితో సంప్రదించండి',
      'dashboard.sendNotifications': 'నోటిఫికేషన్లు పంపండి',
      'dashboard.parentPortal': 'తల్లిదండ్రుల పోర్టల్'
    },
    kn: {
      'app.title.login': 'ಎಡ್ಯುಕನೆಕ್ಟ್ — ಲಾಗಿನ್',
      'app.title.forgot': 'ಎಡ್ಯುಕನೆಕ್ಟ್ — ಪಾಸ್ವರ್ಡ್ ಮರೆತಿದ್ದಾರೆ',
      'app.title.setPassword': 'ಎಡ್ಯುಕನೆಕ್ಟ್ — ಪಾಸ್ವರ್ಡ್ ಹೊಂದಿಸಿ',
      'app.title.dashboard': 'ಎಡ್ಯುಕನೆಕ್ಟ್ — ಡ್ಯಾಶ್ಬೋರ್ಡ್',
      'app.title.admin': 'ಎಡ್ಯುಕನೆಕ್ಟ್ — ನಿರ್ವಾಹಕ ಫಲಕ',
      'common.language': 'ಭಾಷೆ',
      'common.parent': 'ಪೋಷಕ',
      'common.signOut': 'ಸೈನ್ ಔಟ್',
      'common.dashboard': 'ಡ್ಯಾಶ್ಬೋರ್ಡ್',
      'common.attendance': 'ಹಾಜರಾತಿ',
      'common.marks': 'ಮಾರ್ಕ್ಸ್ ಮತ್ತು ಗ್ರೇಡ್ಸ್',
      'common.fees': 'ಶುಲ್ಕ ಸ್ಥಿತಿ',
      'common.reportCard': 'ವರದಿ ಕಾರ್ಡ್',
      'common.overview': 'ಒಂದು ಅವಲೋಕನ',
      'common.academics': 'ಶಿಕ್ಷಣ',
      'common.finance': 'ಹಣಕಾಸು',
      'common.reports': 'ವರದಿಗಳು',
      'auth.brandSub': 'ಶಿಕ್ಷಣವನ್ನು ಸಂಯೋಜಿಸುವುದು',
      'auth.schoolName': 'ಎಸ್.ಆರ್.ಐ. ಸೈರಾಮ್ ಇಂಟರ್ನ್ಯಾಷನಲ್ ಶಾಲೆ',
      'auth.subHeading': 'ನಿಮ್ಮ ಶಾಲೆಯ ಕ್ರೆಡೆನ್ಶಿಯಲ್ಸ್‌ಗಳೊಂದಿಗೆ ಲಾಗಿನ್ ಆಗಿ.',
      'auth.staff': 'ಸ್ಟಾಫ್',
      'auth.parentLabel': 'ಪೋಷಕ',
      'auth.username': 'ಬಳಕೆದಾರ ಹೆಸರು ಅಥವಾ ಇಮೇಲ್',
      'auth.usernamePlaceholder': 'ಬಳಕೆದಾರ ಹೆಸರು ಅಥವಾ ಇಮೇಲ್',
      'auth.password': 'ಪಾಸ್ವರ್ಡ್',
      'auth.passwordPlaceholder': 'ಪಾಸ್ವರ್ಡ್',
      'auth.remember': 'ನೆನಪಿಟ್ಟುಕೊಳ್ಳುವಿರಾ?',
      'auth.forgot': 'ಪಾಸ್ವರ್ಡ್ ಮರೆತಿದ್ದೀರಾ?',
      'auth.login': 'ಲಾಗಿನ್',
      'auth.signin': 'ಲಾಗಿನ್',
      'auth.signingIn': 'ಲಾಗಿನ್ ಆಗುತ್ತಿದ್ದೇವೆ…',
      'auth.enterCredentials': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಬಳಕೆದಾರ ಹೆಸರು ಮತ್ತು ಪಾಸ್ವರ್ಡ್ ಅನ್ನು ನಮೂದಿಸಿ.',
      'auth.loginButtonUnavailable': 'ಲಾಗಿನ್ ಬಟನ್ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಪುಟವನ್ನು ಮತ್ತೆ ಲೋಡ್ ಮಾಡಿ.',
      'auth.loginFailed': 'ಲಾಗಿನ್ ವಿಫಲವಾಗಿದೆ.',
      'auth.serverUnavailable': 'ಸರ್ವರ್ನೊಂದಿಗೆ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ. ಬ್ಯಾಕ್‌ಎಂಡ್ ಚಲಿಸುತ್ತಿದೆಯೇ?',
      'auth.focusNote': 'ಪೋರ್ಟ್‌ಲ್ಗೆ ಪ್ರವೇಶಿಸಲು ನಿಮ್ಮ ಶಾಲೆ ಒದಗಿಸಿದ ಬಳಕೆದಾರ ಹೆಸರು ಮತ್ತು ಪಾಸ್ವರ್ಡ್ ಬಳಸಿ.',
      'auth.forgotTitle': 'ಪಾಸ್ವರ್ಡ್ ಮರೆತಿದ್ದೀರಾ?',
      'auth.forgotSub': 'ನಿಮ್ಮ ನೋಂದಾಯಿತ ಇಮೇಲ್ ಅನ್ನು ನಮೂದಿಸಿ; ನಾವು ರಿಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸುತ್ತೇವೆ.',
      'auth.emailAddress': 'ಇಮೇಲ್ ವಿಳಾಸ',
      'auth.emailPlaceholder': 'your@email.com',
      'auth.sendReset': 'ರಿಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಿ',
      'auth.sending': 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…',
      'auth.backToLogin': 'ಲಾಗಿನ್ ಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ',
      'auth.enterEmail': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಇಮೇಲ್ ಅನ್ನು ನಮೂದಿಸಿ.',
      'auth.resetLinkSent': 'ರಿಸೆಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಲಾಗಿದೆ!',
      'auth.resetUnavailable': 'ಸರ್ವರ್ನೊಂದಿಗೆ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ.',
      'auth.setPasswordTitle': 'ನಿಮ್ಮ ಪಾಸ್ವರ್ಡ್ ಹೊಂದಿಸಿ',
      'auth.setPasswordSub': 'ನಿಮ್ಮ ಸ್ವಾಗತ ಇಮೇಲ್‌ನಲ್ಲಿ ಇರುವ ಸೆಟಪ್ ಟೋಕನ್ ಅನ್ನು ನಮೂದಿಸಿ, ಭದ್ರമായ ಪಾಸ್ವರ್ಡ್ ರಚಿಸಿ.',
      'auth.setupToken': 'ಸೆಟಪ್ ಟೋಕನ್ (ಇಮೇಲ್‌ನಿಂದ)',
      'auth.setupTokenPlaceholder': 'ಇಮೇಲ್‌ನಿಂದ ಟೋಕನ್ ಪೇಸ್ಟ್ ಮಾಡಿ…',
      'auth.newPassword': 'ಹೊಸ ಪಾಸ್ವರ್ಡ್',
      'auth.newPasswordPlaceholder': 'ಕನಿಷ್ಠ 6 ಅಕ್ಷರಗಳು',
      'auth.confirmPassword': 'ಪಾಸ್ವರ್ಡ್ ಖಚಿತಪಡಿಸಿ',
      'auth.confirmPasswordPlaceholder': 'ಪಾಸ್ವರ್ಡ್ ಮತ್ತೆ ನಮೂದಿಸಿ',
      'auth.ruleMin': 'ಕನಿಷ್ಠ 6 ಅಕ್ಷರಗಳು',
      'auth.ruleNumber': 'ಒಂದು ಸಂಖ್ಯೆ ಇರುತ್ತದೆ',
      'auth.ruleMatch': 'ಪಾಸ್ವರ್ಡ್ಗಳು ಹೊಂದಿಕೆಯಾಗಿವೆ',
      'auth.setPassword': 'ಪಾಸ್ವರ್ಡ್ ಹೊಂದಿಸಿ',
      'auth.settingPassword': 'ಪಾಸ್ವರ್ಡ್ ಹೊಂದಿಸಲಾಗುತ್ತಿದೆ…',
      'auth.enterToken': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಇಮೇಲ್‌ನಲ್ಲಿ ಇರುವ ಸೆಟಪ್ ಟೋಕನ್ ನಮೂದಿಸಿ.',
      'auth.passwordTooShort': 'ಪಾಸ್ವರ್ಡ್ ಕನಿಷ್ಠ 6 ಅಕ್ಷರಗಳಾಗಿರಬೇಕು.',
      'auth.passwordMismatch': 'ಪಾಸ್ವರ್ಡ್ಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ.',
      'auth.passwordSet': 'ಪಾಸ್ವರ್ಡ್ ಹೊಂದಿಸಲಾಗಿದೆ! ಲಾಗಿನ್‌ಗೆ ಮರುನಿರ್ದೇಶನ ಆಗುತ್ತಿದ್ದೇವೆ…',
      'auth.passwordSetFailed': 'ವಿಫಲವಾಗಿದೆ.',
      'auth.passwordConnectError': 'ಸರ್ವರ್ನೊಂದಿಗೆ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ.',
      'dashboard.topbarTitle': 'ಡ್ಯಾಶ್ಬೋರ್ಡ್',
      'dashboard.attendanceWarning': 'ಹಾಜರಾತಿ ಎಚ್ಚರಿಕೆ! ನಿಮ್ಮ ಮಗುವಿನ ಹಾಜರಾತಿ 75% ಕ್ಕಿಂತ ಕಡಿಮೆಯಾಗಿದೆ. ನಿಮಗೆ ಇಮೇಲ್ ಅಲರ್ಟ್ ಕಳುಹಿಸಲಾಗಿದೆ.',
      'dashboard.attendancePanel': 'ಹಾಜರಾತಿ',
      'dashboard.minimumRequired': 'ಕನಿಷ್ಠ ಅಗತ್ಯವಿದೆ:',
      'dashboard.loading': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
      'dashboard.attendanceOverview': 'ಹಾಜರಾತಿ ಅವಲೋಕನ',
      'dashboard.adminPanel': 'ನಿರ್ವಾಹಕ ಫಲಕ',
      'dashboard.importStudents': 'ವಿದ್ಯಾರ್ಥಿಗಳನ್ನು ಆಮದು ಮಾಡಿ',
      'dashboard.importMarks': 'ಮಾರ್ಕ್ಸ್ ಆಮದು ಮಾಡಿ',
      'dashboard.allStudents': 'ಎಲ್ಲಾ ವಿದ್ಯಾರ್ಥಿಗಳು',
      'dashboard.manageMarks': 'ಮಾರ್ಕ್ಸ್ ನಿರ್ವಹಿಸಿ',
      'dashboard.feeRecords': 'ಶುಲ್ಕ ದಾಖಲೆಗಳು',
      'dashboard.contactParent': 'ಪೋಷಕರನ್ನು ಸಂಪರ್ಕಿಸಿ',
      'dashboard.sendNotifications': 'ಅಧಿಸೂಚನೆಗಳನ್ನು ಕಳುಹಿಸಿ',
      'dashboard.parentPortal': 'ಪೋಷಕರ ಪೋರ್ಟಲ್'
    }
  };

  function normalizeLanguage(lang) {
    if (!lang) return 'en';
    const lower = String(lang).toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(lower)) return lower;
    const short = lower.split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(short)) return short;
    return 'en';
  }

  function detectLanguage() {
    const savedLang = localStorage.getItem('appLanguage');
    if (savedLang && SUPPORTED_LANGUAGES.includes(savedLang)) return savedLang;

    const list = navigator.languages || [navigator.language || 'en'];
    for (const entry of list) {
      const detected = normalizeLanguage(entry);
      if (detected) return detected;
    }
    return 'en';
  }

  let currentLanguage = 'en';

  function translate(key, lang) {
    const resolvedLang = lang || currentLanguage;
    const languagePack = translations[resolvedLang] || translations.en;
    return languagePack[key] || translations.en[key] || key;
  }

  function applyTranslations(lang) {
    currentLanguage = normalizeLanguage(lang);
    document.documentElement.lang = currentLanguage;
    document.documentElement.setAttribute('data-lang', currentLanguage);

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.getAttribute('data-i18n');
      const value = translate(key, currentLanguage);
      if (value) {
        if (element.getAttribute('data-i18n-html') === 'true') {
          element.innerHTML = value;
        } else {
          element.textContent = value;
        }
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const value = translate(element.getAttribute('data-i18n-placeholder'), currentLanguage);
      if (value) element.setAttribute('placeholder', value);
    });

    document.querySelectorAll('[data-i18n-title]').forEach((element) => {
      const value = translate(element.getAttribute('data-i18n-title'), currentLanguage);
      if (value) element.setAttribute('title', value);
    });

    document.querySelectorAll('[data-i18n-value]').forEach((element) => {
      const value = translate(element.getAttribute('data-i18n-value'), currentLanguage);
      if (value) element.value = value;
    });

    document.querySelectorAll('[data-lang-switcher]').forEach((element) => {
      element.value = currentLanguage;
    });

    document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: currentLanguage } }));
  }

  function setPageTitle(titleKey, lang) {
    if (!titleKey) return;
    const title = translate(titleKey, lang || currentLanguage);
    if (title) {
      document.title = title;
    }
  }

  function onDOMReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }

  function initLanguage(options) {
    onDOMReady(() => {
      currentLanguage = detectLanguage();
      localStorage.setItem('appLanguage', currentLanguage);
      applyTranslations(currentLanguage);
      setPageTitle(options && options.titleKey, currentLanguage);

      document.querySelectorAll('[data-lang-switcher]').forEach((element) => {
        element.addEventListener('change', (event) => {
          const selected = normalizeLanguage(event.target.value);
          currentLanguage = selected;
          localStorage.setItem('appLanguage', selected);
          applyTranslations(selected);
          setPageTitle(options && options.titleKey, selected);
        });
      });
    });
  }

  window.t = function (key, lang) {
    return translate(key, lang || currentLanguage);
  };
  window.initLanguage = initLanguage;
  window.setLanguage = function (lang) {
    const selected = normalizeLanguage(lang);
    currentLanguage = selected;
    localStorage.setItem('appLanguage', selected);
    applyTranslations(selected);
  };
  window.getCurrentLanguage = function () {
    return currentLanguage;
  };
})();
