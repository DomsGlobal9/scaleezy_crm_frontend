/**
 * The message Today writes for each reason, in the customer's language (English, Hindi, Telugu,
 * Tamil, Kannada -- Inventory's Help languages). Staff change anything before sending; nothing is
 * sent from here: WhatsApp opens on their phone with the words in it.
 *
 * {name} their first name, {shop} the shop's name, {item} what they asked about.
 * A native speaker should read these before a shop uses them (written 28 Oct 2026).
 */
export const LANGUAGES = [
  ['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'], ['kn', 'ಕನ್ನಡ']
];

const OUR_SHOP = { en: 'our shop', hi: 'हमारी दुकान', te: 'మా షాప్', ta: 'எங்கள் கடை', kn: 'ನಮ್ಮ ಅಂಗಡಿ' };

const T = {
  promise: {
    en: 'Hello {name}, this is {shop}. Following up as promised. When is a good time to talk, or would you like to drop in?',
    hi: 'नमस्ते {name} जी, {shop} से बात कर रहे हैं। वादे के मुताबिक़ आपसे संपर्क कर रहे हैं — बात करने का सही समय बताइए, या दुकान पर आइए।',
    te: 'నమస్తే {name} గారు, {shop} నుండి. మాట ఇచ్చినట్టు మిమ్మల్ని సంప్రదిస్తున్నాం — మాట్లాడటానికి మీకు వీలైన సమయం చెప్పండి, లేదా షాప్‌కి రండి.',
    ta: 'வணக்கம் {name}, {shop}-லிருந்து. சொன்னபடி உங்களைத் தொடர்பு கொள்கிறோம் — பேச வசதியான நேரத்தைச் சொல்லுங்கள், அல்லது கடைக்கு வாருங்கள்.',
    kn: 'ನಮಸ್ಕಾರ {name} ಅವರೇ, {shop} ಇಂದ. ಮಾತು ಕೊಟ್ಟಂತೆ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇವೆ — ಮಾತನಾಡಲು ಅನುಕೂಲವಾದ ಸಮಯ ತಿಳಿಸಿ, ಅಥವಾ ಅಂಗಡಿಗೆ ಬನ್ನಿ.'
  },
  stock: {
    en: 'Hello {name}, this is {shop}. The {item} you asked about is here. Shall we keep it aside for you?',
    hi: 'नमस्ते {name} जी, {shop} से। आपने जो {item} पूछा था, वह आ गया है। क्या आपके लिए अलग रख दें?',
    te: 'నమస్తే {name} గారు, {shop} నుండి. మీరు అడిగిన {item} వచ్చింది. మీ కోసం పక్కన పెట్టమంటారా?',
    ta: 'வணக்கம் {name}, {shop}-லிருந்து. நீங்கள் கேட்ட {item} வந்துவிட்டது. உங்களுக்காக எடுத்து வைக்கவா?',
    kn: 'ನಮಸ್ಕಾರ {name} ಅವರೇ, {shop} ಇಂದ. ನೀವು ಕೇಳಿದ {item} ಬಂದಿದೆ. ನಿಮಗಾಗಿ ತೆಗೆದಿಡಲೇ?'
  },
  notseen: {
    en: 'Hello {name}, it has been a while! This is {shop}. New festive stock is in. Do drop in when you can.',
    hi: 'नमस्ते {name} जी, बहुत दिन हो गए! {shop} में नया त्योहारी स्टॉक आया है — समय मिले तो ज़रूर आइए।',
    te: 'నమస్తే {name} గారు, చాలా రోజులైంది! {shop}కి కొత్త పండుగ స్టాక్ వచ్చింది — వీలైనప్పుడు తప్పకుండా రండి.',
    ta: 'வணக்கம் {name}, நீண்ட நாட்களாகிவிட்டது! {shop}-க்கு புதிய பண்டிகை ஸ்டாக் வந்துள்ளது — நேரம் கிடைக்கும்போது வாருங்கள்.',
    kn: 'ನಮಸ್ಕಾರ {name} ಅವರೇ, ತುಂಬಾ ದಿನಗಳಾದವು! {shop} ಗೆ ಹೊಸ ಹಬ್ಬದ ಸ್ಟಾಕ್ ಬಂದಿದೆ — ಸಮಯವಿದ್ದಾಗ ಬನ್ನಿ.'
  }
};

/** The message for one row of Today, in one language. */
export function messageFor(item, language, shopName) {
  const key = item.kind;
  const lang = T[key]?.[language] ? language : 'en';
  return (T[key]?.[lang] ?? T.promise[lang])
    .replaceAll('{name}', item.customer.firstName)
    .replaceAll('{shop}', shopName || OUR_SHOP[lang])
    .replaceAll('{item}', item.facts.item ?? '');
}

/** wa.me wants the number as digits with the country code, no plus. */
export const whatsappLink = (phone, text) => `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
