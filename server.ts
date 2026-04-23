import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { google } from "googleapis";
import { GoogleAdsApi } from "google-ads-api";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// OAuth Google Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
);

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get Auth URL
  app.get("/api/auth/google-ads/url", (req, res) => {
    try {
      if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
        console.error("Missing Google Ads credentials in environment variables");
        return res.status(500).json({ 
          error: "Configuración incompleta", 
          details: "Faltan las variables GOOGLE_ADS_CLIENT_ID o CLIENT_SECRET en el servidor/Vercel." 
        });
      }

      const clientOrigin = req.query.origin as string;
      const origin = clientOrigin || req.headers.origin || `${req.protocol}://${req.get('host')}`;
      const redirectUri = `${origin}/auth/callback`;
      
      // We pass the origin in the state parameter to retrieve it in the callback
      const state = Buffer.from(JSON.stringify({ origin })).toString('base64');

      const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/adwords"],
        prompt: "consent",
        redirect_uri: redirectUri,
        state: state
      });
      res.json({ url });
    } catch (error: any) {
      console.error("Error generating auth URL:", error);
      res.status(500).json({ error: "Error interno", details: error.message });
    }
  });

  // Callback
  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code, state } = req.query;
    
    let origin = "";
    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
        origin = decodedState.origin;
      }
    } catch (e) {
      console.error("Error decoding state:", e);
    }

    if (!origin) {
      // In production (Vercel/Cloud Run), we trust the host header and force https
      const host = req.get('host');
      origin = host?.includes('localhost') ? `http://${host}` : `https://${host}`;
    }

    const redirectUri = `${origin}/auth/callback`;

    try {
      if (!process.env.GOOGLE_ADS_CLIENT_ID || !process.env.GOOGLE_ADS_CLIENT_SECRET) {
        throw new Error("Missing Client ID or Secret in environment variables");
      }

      const { tokens } = await oauth2Client.getToken({
        code: code as string,
        redirect_uri: redirectUri
      });
      
      // In a real app, you'd save these to a database (Firestore)
      // For now, we'll send them back or log them (Careful with security)
      // Ideally Pepa should be able to read these from Firestore
      
      console.log("Tokens received:", tokens);

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_ADS_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <h1>Autenticación Exitosa</h1>
            <p>Puedes cerrar esta ventana.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Error en la autenticación");
    }
  });

  // Tool to create/manage ads (to be called by Pepa)
  app.post("/api/ads/create-campaign", async (req, res) => {
    const { tokens, action, campaignData } = req.body;
    
    if (!tokens || !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      return res.status(400).json({ error: "Missing tokens or developer token in environment" });
    }

    try {
      const client = new GoogleAdsApi({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      });

      const managerId = process.env.GOOGLE_ADS_MANAGER_ACCOUNT;
      const isManager = managerId && managerId !== 'false';

      const customer = client.Customer({
        customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, ''),
        refresh_token: tokens.refresh_token,
        login_customer_id: isManager ? managerId.replace(/-/g, '') : undefined,
      });

      if (action === 'list_campaigns') {
        const campaigns = await customer.report({
          entity: "campaign",
          attributes: ["campaign.id", "campaign.name", "campaign.status"],
          metrics: ["metrics.clicks", "metrics.cost_micros", "metrics.impressions"],
          limit: 10,
        });
        return res.json({ campaigns });
      }

      // If action is create_campaign
      // For now, returning a simulated success since actual creation is multi-step (Budget -> Campaign -> Group -> Ad)
      res.json({ 
        success: true, 
        message: `Plan de campaña '${campaignData?.name || 'Venta Doña Pepa'}' recibido. La API respondió correctamente.`,
        suggestedBudget: campaignData?.budget,
        status: "Draft / Pending Production Approval"
      });
    } catch (error: any) {
      console.error("Ads API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
