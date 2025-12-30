import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { google } from "googleapis";
import open from "open";

const TOKEN_PATH = path.join(process.cwd(), ".oauth-tokens.json");

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
}

export class OAuthManager {
  private oauth2Client: any;
  private provider: "gmail" | "yahoo";
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(provider: "gmail" | "yahoo" = "gmail") {
    this.provider = provider;
    
    this.clientId = process.env.OAUTH_CLIENT_ID || "";
    this.clientSecret = process.env.OAUTH_CLIENT_SECRET || "";
    this.redirectUri = process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/oauth/callback";

    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET in .env file");
    }

    if (provider === "gmail") {
      this.oauth2Client = new google.auth.OAuth2(this.clientId, this.clientSecret, this.redirectUri);
    }
    // For Yahoo, we'll use manual OAuth flow
  }

  /**
   * Gets a valid access token, either from cache or by starting OAuth flow
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    const cached = this.loadTokenFromFile();
    if (cached) {
      // Check if token is still valid
      if (cached.expiry_date && cached.expiry_date > Date.now()) {
        console.log("✓ Using cached OAuth token");
        return cached.access_token;
      }
      
      // Try to refresh the token
      if (this.provider === "gmail" && cached.refresh_token) {
        this.oauth2Client.setCredentials(cached);
        try {
          console.log("⟳ Refreshing OAuth token...");
          const { credentials } = await this.oauth2Client.refreshAccessToken();
          this.saveTokenToFile(credentials);
          return credentials.access_token!;
        } catch (error) {
          console.log("Failed to refresh token, starting new OAuth flow");
        }
      } else if (this.provider === "yahoo" && cached.refresh_token) {
        try {
          console.log("⟳ Refreshing Yahoo OAuth token...");
          const newToken = await this.refreshYahooToken(cached.refresh_token);
          return newToken;
        } catch (error) {
          console.log("Failed to refresh token, starting new OAuth flow");
        }
      }
    }

    // No valid token, start OAuth flow
    return this.startOAuthFlow();
  }

  /**
   * Refresh Yahoo OAuth token
   */
  private async refreshYahooToken(refreshToken: string): Promise<string> {
    const tokenUrl = "https://api.login.yahoo.com/oauth2/get_token";
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    return new Promise((resolve, reject) => {
      const req = https.request(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.access_token) {
              const tokenData = {
                access_token: result.access_token,
                refresh_token: refreshToken,
                expiry_date: Date.now() + (result.expires_in * 1000),
                token_type: result.token_type,
              };
              this.saveTokenToFile(tokenData);
              resolve(result.access_token);
            } else {
              reject(new Error("No access token in response"));
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on("error", reject);
      req.write(params.toString());
      req.end();
    });
  }

  /**
   * Starts the OAuth 2.0 authorization flow
   * Opens browser for user to authorize, then waits for callback
   */
  private async startOAuthFlow(): Promise<string> {
    console.log("\n🔐 OAuth 2.0 Authentication Required");
    console.log("──────────────────────────────────────");
    console.log("You will be prompted to authorize this application.");
    console.log("This is a ONE-TIME setup per session.\n");

    let authUrl: string;
    
    if (this.provider === "gmail") {
      authUrl = this.oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://mail.google.com/"],
        prompt: "consent",
      });
    } else {
      // Yahoo OAuth URL - try different scope formats
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        response_type: "code",
        scope: "openid,mail-r",
      });
      authUrl = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
    }

    console.log("📱 Opening browser for authorization...");
    console.log("If browser doesn't open, visit this URL:");
    console.log(authUrl);
    console.log();

    // Open browser
    try {
      await open(authUrl);
    } catch {
      console.log("Could not open browser automatically. Please open the URL manually.");
    }

    // Start local server to receive callback
    const code = await this.waitForAuthCode();

    console.log("✓ Authorization code received");
    console.log("⟳ Exchanging code for access token...");

    let tokens: any;
    
    if (this.provider === "gmail") {
      const result = await this.oauth2Client.getToken(code);
      tokens = result.tokens;
      this.oauth2Client.setCredentials(tokens);
    } else {
      tokens = await this.exchangeYahooCode(code);
    }
    
    this.saveTokenToFile(tokens);

    console.log("✓ OAuth authentication successful!");
    console.log("✓ Token cached for future use\n");

    return tokens.access_token!;
  }

  /**
   * Exchange Yahoo authorization code for access token
   */
  private async exchangeYahooCode(code: string): Promise<TokenData> {
    const tokenUrl = "https://api.login.yahoo.com/oauth2/get_token";
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    return new Promise((resolve, reject) => {
      const req = https.request(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (result.access_token) {
              resolve({
                access_token: result.access_token,
                refresh_token: result.refresh_token,
                expiry_date: Date.now() + (result.expires_in * 1000),
                token_type: result.token_type,
              });
            } else {
              reject(new Error(`Token exchange failed: ${data}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on("error", reject);
      req.write(params.toString());
      req.end();
    });
  }

  /**
   * Starts temporary HTTP server to receive OAuth callback
   */
  private waitForAuthCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        if (req.url?.startsWith("/oauth/callback")) {
          const url = new URL(req.url, "http://localhost:3000");
          const code = url.searchParams.get("code");

          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <html>
                <head><title>Authorization Successful</title></head>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                  <h1 style="color: #28a745;">✓ Authorization Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                  <script>setTimeout(() => window.close(), 2000);</script>
                </body>
              </html>
            `);
            server.close();
            resolve(code);
          } else {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Authorization failed: No code received");
            server.close();
            reject(new Error("No authorization code received"));
          }
        }
      });

      server.listen(3000, () => {
        console.log("⏳ Waiting for authorization...");
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error("Authorization timeout"));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Load token from file cache
   */
  private loadTokenFromFile(): TokenData | null {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const data = fs.readFileSync(TOKEN_PATH, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.log("Failed to load cached token");
    }
    return null;
  }

  /**
   * Save token to file cache
   */
  private saveTokenToFile(token: any): void {
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
      console.log(`✓ Token cached to ${path.basename(TOKEN_PATH)}`);
    } catch (error) {
      console.log("Warning: Failed to cache token");
    }
  }

  /**
   * Revoke the current token (logout)
   */
  async revokeToken(): Promise<void> {
    try {
      if (this.provider === "gmail") {
        await this.oauth2Client.revokeCredentials();
      }
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH);
      }
      console.log("✓ Token revoked successfully");
    } catch (error) {
      console.log("Failed to revoke token");
    }
  }

  /**
   * Get OAuth credentials in IMAP-compatible format
   */
  getImapAuth(user: string, accessToken: string) {
    return {
      user,
      accessToken,
    };
  }
}
