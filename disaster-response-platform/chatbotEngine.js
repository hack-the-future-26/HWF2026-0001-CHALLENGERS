/**
 * chatbotEngine.js
 * ----------------
 * Rule-based multi-language emergency guidance chatbot.
 * Provides immediate safety instructions for common disaster scenarios
 * while a human responder is dispatched. Fully offline-capable.
 */

const RESPONSES = {
  flood: {
    en: "FLOOD SAFETY: Move to higher ground immediately. Avoid walking or driving through moving water (6 inches can knock you down). Turn off electricity at the mains if safe to do so. Keep important documents and phone dry. Your report has been logged — help is being prioritized based on severity.",
    hi: "बाढ़ सुरक्षा: तुरंत ऊँची जगह पर जाएँ। बहते पानी में चलने या गाड़ी चलाने से बचें। यदि सुरक्षित हो तो मुख्य बिजली स्विच बंद कर दें। ज़रूरी दस्तावेज़ और फ़ोन को सूखा रखें। आपकी रिपोर्ट दर्ज कर ली गई है — गंभीरता के आधार पर मदद भेजी जा रही है।",
    te: "వరద భద్రత: వెంటనే ఎత్తైన ప్రదేశానికి వెళ్లండి. ప్రవహిస్తున్న నీటిలో నడవడం లేదా వాహనం నడపడం మానుకోండి. సురక్షితమైతే మెయిన్ స్విచ్ నుండి కరెంట్ ఆఫ్ చేయండి. మీ నివేదిక నమోదైంది — తీవ్రత ఆధారంగా సహాయం పంపబడుతోంది.",
  },
  fire: {
    en: "FIRE SAFETY: Get low and cover your nose/mouth with a wet cloth to avoid smoke inhalation. Do not use elevators. Feel doors before opening — if hot, find another exit. Once outside, move far from the building. Your report has been logged as high priority.",
    hi: "आग सुरक्षा: नीचे झुकें और धुएं से बचने के लिए नाक-मुँह को गीले कपड़े से ढकें। लिफ्ट का उपयोग न करें। दरवाज़ा खोलने से पहले उसे छूकर देखें — अगर गर्म हो तो दूसरा रास्ता खोजें। बाहर निकलने के बाद इमारत से दूर चले जाएँ। आपकी रिपोर्ट उच्च प्राथमिकता पर दर्ज है।",
    te: "అగ్ని భద్రత: క్రిందికి వంగి, పొగ పీల్చకుండా తడి గుడ్డతో ముక్కు/నోరు కప్పుకోండి. లిఫ్ట్‌లు వాడకండి. తలుపు తెరవడానికి ముందు తాకి చూడండి — వేడిగా ఉంటే మరో మార్గం చూడండి. బయటకు వచ్చాక భవనానికి దూరంగా వెళ్లండి. మీ నివేదిక అత్యవసర ప్రాధాన్యతతో నమోదైంది.",
  },
  earthquake: {
    en: "EARTHQUAKE SAFETY: Drop, Cover, and Hold On. Get under sturdy furniture and protect your head/neck. Stay away from windows and heavy objects. After shaking stops, check for injuries and move to open ground if the building is damaged. Aftershocks are possible — stay alert.",
    hi: "भूकंप सुरक्षा: नीचे झुकें, ढकें और पकड़ें। मजबूत फर्नीचर के नीचे जाएँ और सिर/गर्दन को बचाएँ। खिड़कियों और भारी वस्तुओं से दूर रहें। कंपन रुकने के बाद चोटों की जाँच करें और यदि इमारत क्षतिग्रस्त है तो खुले मैदान में जाएँ।",
    te: "భూకంప భద్రత: వంగండి, కప్పుకోండి, పట్టుకోండి. దృఢమైన ఫర్నిచర్ కింద ఉండి తల/మెడను రక్షించుకోండి. కిటికీలు మరియు బరువైన వస్తువుల నుండి దూరంగా ఉండండి. కంపనం ఆగాక గాయాలు తనిఖీ చేసి, భవనం దెబ్బతింటే బహిరంగ ప్రదేశానికి వెళ్లండి.",
  },
  cyclone: {
    en: "CYCLONE SAFETY: Stay indoors, away from windows. Keep emergency supplies (water, food, torch, radio) ready. If in a low-lying or coastal area, evacuate to the nearest designated shelter before the storm intensifies. Do not go outside during the eye of the storm.",
    hi: "चक्रवात सुरक्षा: घर के अंदर रहें, खिड़कियों से दूर। आपातकालीन सामान (पानी, भोजन, टॉर्च, रेडियो) तैयार रखें। यदि निचले या तटीय क्षेत्र में हैं, तो तूफान तेज़ होने से पहले नज़दीकी आश्रय स्थल पर चले जाएँ।",
    te: "తుఫాను భద్రత: ఇంటి లోపల ఉండండి, కిటికీలకు దూరంగా. అత్యవసర సామాగ్రి (నీరు, ఆహారం, టార్చ్, రేడియో) సిద్ధంగా ఉంచుకోండి. తక్కువ ఎత్తులో లేదా తీర ప్రాంతంలో ఉంటే, తుఫాను తీవ్రమయ్యే ముందే సమీప ఆశ్రయానికి వెళ్లండి.",
  },
  medical: {
    en: "MEDICAL EMERGENCY: If someone is unconscious, check breathing and begin CPR if trained. Keep the person still if injury to neck/back is suspected. Apply firm pressure to any bleeding wound with clean cloth. Your report has been flagged as high priority — an ambulance/responder is being notified.",
    hi: "चिकित्सा आपातकाल: यदि कोई बेहोश है, तो साँस जाँचें और प्रशिक्षित होने पर CPR शुरू करें। यदि गर्दन/पीठ में चोट का संदेह है तो व्यक्ति को स्थिर रखें। खून बहने वाले घाव पर साफ कपड़े से दबाव डालें। आपकी रिपोर्ट उच्च प्राथमिकता पर चिह्नित है।",
    te: "వైద్య అత్యవసర పరిస్థితి: ఎవరైనా అపస్మారక స్థితిలో ఉంటే, శ్వాస తనిఖీ చేసి, శిక్షణ ఉంటే CPR ప్రారంభించండి. మెడ/వెన్నెముకకు గాయం అనుమానం ఉంటే వ్యక్తిని కదలకుండా ఉంచండి. రక్తస్రావం అయ్యే గాయంపై శుభ్రమైన గుడ్డతో గట్టిగా నొక్కండి.",
  },
  landslide: {
    en: "LANDSLIDE SAFETY: Move away from the path of the slide, to the nearest high ground perpendicular to the flow. Watch for cracking sounds or trees tilting, which may signal further movement. Do not return to the area until authorities confirm it's safe.",
    hi: "भूस्खलन सुरक्षा: भूस्खलन के रास्ते से दूर, प्रवाह के लंबवत निकटतम ऊँची जगह पर जाएँ। दरारों की आवाज़ या पेड़ों के झुकने पर ध्यान दें। अधिकारियों की पुष्टि तक क्षेत्र में वापस न जाएँ।",
    te: "కొండచరియ భద్రత: జారుడు మార్గం నుండి దూరంగా, ప్రవాహానికి లంబంగా ఉన్న సమీప ఎత్తైన ప్రదేశానికి వెళ్లండి. పగుళ్ల శబ్దాలు లేదా చెట్లు వంగడం గమనించండి. అధికారులు నిర్ధారించే వరకు ఆ ప్రాంతానికి తిరిగి వెళ్లవద్దు.",
  },
  general: {
    en: "Your message has been received. Please share your exact location and describe the situation (number of people, injuries, immediate dangers) so we can prioritize help correctly. If this is life-threatening, also call your local emergency number immediately.",
    hi: "आपका संदेश प्राप्त हो गया है। कृपया अपना सटीक स्थान बताएं और स्थिति का वर्णन करें (लोगों की संख्या, चोटें, तत्काल खतरे) ताकि हम सही ढंग से मदद को प्राथमिकता दे सकें। यदि यह जानलेवा है, तो तुरंत अपने स्थानीय आपातकालीन नंबर पर कॉल करें।",
    te: "మీ సందేశం అందింది. దయచేసి మీ ఖచ్చితమైన స్థానం మరియు పరిస్థితిని (వ్యక్తుల సంఖ్య, గాయాలు, తక్షణ ప్రమాదాలు) తెలియజేయండి. ఇది ప్రాణాంతకమైతే, వెంటనే మీ స్థానిక అత్యవసర నంబర్‌కు కాల్ చేయండి.",
  },
};

const GREETINGS = {
  en: "Hello, I'm the Emergency Assistance bot. Tell me what's happening and your location — I'll give you safety guidance and log a priority request for responders.",
  hi: "नमस्ते, मैं आपातकालीन सहायता बॉट हूँ। मुझे बताएं कि क्या हो रहा है और आपका स्थान — मैं आपको सुरक्षा मार्गदर्शन दूंगा और उत्तरदाताओं के लिए एक प्राथमिकता अनुरोध दर्ज करूंगा।",
  te: "నమస్తే, నేను అత్యవసర సహాయ బాట్‌ని. ఏమి జరుగుతుందో మరియు మీ స్థానం చెప్పండి — నేను మీకు భద్రతా మార్గదర్శకత్వం ఇచ్చి, ప్రతిస్పందకుల కోసం ప్రాధాన్య అభ్యర్థనను నమోదు చేస్తాను.",
};

function getChatbotReply(message, language, disasterType) {
  const lang = ["en", "hi", "te"].includes(language) ? language : "en";
  if (!message || message.trim().length === 0) {
    return GREETINGS[lang];
  }
  const type = DISASTER_TYPE_FALLBACK(disasterType);
  return RESPONSES[type][lang] || RESPONSES.general[lang];
}

function DISASTER_TYPE_FALLBACK(type) {
  if (type && RESPONSES[type]) return type;
  return "general";
}

module.exports = { getChatbotReply, GREETINGS };
