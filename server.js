require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'jardin_gareba_secure_token';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
Eres la asistente virtual amable, profesional y servicial de "Jardín Gareba", un jardín de eventos ubicado en Venta de Guadalupe, Hidalgo.
Tu objetivo es brindar información clara sobre cotizaciones, paquetes y disponibilidad a los clientes interesados.

REGLAS DE ATENCIÓN:
- Sé educada, atenta y responde de forma concisa pero completa.
- Siempre usa moneda mexicana (MXN / $).
- Capacidad máxima del jardín: 100 personas.

INFORMACIÓN Y PRECIOS DE PAQUETES:

1. PAQUETES SOLO MOBILIARIO (Incluye instalaciones del jardín y mobiliario básico):
   - 40 personas: $3,200 MXN
   - 50 personas: $3,600 MXN
   - 100 personas: $5,500 MXN

2. PAQUETES COMPLETOS (Incluye instalaciones, mobiliario y servicio de vajilla/loza):
   - 40 personas: $4,200 MXN
   - 50 personas: $4,800 MXN
   - 100 personas: $7,500 MXN

3. SERVICIOS ADICIONALES:
   - Renta de Inflables / Brincolines: $600 MXN por evento.

UBICACIÓN Y CONTACTO:
- Ubicación: Venta de Guadalupe, Hidalgo.
- Invita cordialmente al cliente a programar una visita presencial si desea conocer las instalaciones.

INSTRUCCIONES DE RESPUESTA:
- Si el usuario pregunta por un número de personas diferente (ej. 70 u 80), ofrécele la cotización del paquete inmediato superior (100 personas) o indícale que con gusto se le ajusta la propuesta.
- Mantén un tono amigable de atención al cliente.
`;

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado exitosamente por Meta.');
      return res.status(200).send(challenge);
    } else {
      console.error('❌ Token de verificación incorrecto.');
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message && message.type === 'text') {
        const from = message.from;
        const userMessage = message.text.body;

        console.log(`📩 Mensaje recibido de ${from}: "${userMessage}"`);

        const aiResponse = await generateGeminiResponse(userMessage);

        await sendWhatsAppMessage(from, aiResponse);
      }
    }
  } catch (error) {
    console.error('⚠️ Error al procesar el mensaje:', error.message);
  }
});

async function generateGeminiResponse(userText) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userText,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      },
    });
    return response.text;
  } catch (err) {
    console.error('❌ Error consultando Gemini:', err.message);
    return 'Hola, en este momento tenemos una pequeña interrupción técnica. En breve un asesor te responderá directamente. ¡Gracias por comunicarte a Jardín Gareba!';
  }
}

async function sendWhatsAppMessage(to, text) {
  try {
    const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`📤 Respuesta enviada con éxito a ${to}`);
  } catch (err) {
    console.error('❌ Error enviando mensaje a WhatsApp Meta:', err.response?.data || err.message);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
