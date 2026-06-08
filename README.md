# Asta Torneo Basket

App per asta fantabasket — banditore su PC/tablet, allenatori su cellulare, sync realtime con Ably.

## Online (Vercel)

Il codice è su [github.com/lol3gg/basket](https://github.com/lol3gg/basket).  
L'hosting è su **Vercel** (non GitHub Pages — il repo è solo il deposito del codice).

### Deploy su Vercel (prima volta)

1. Vai su [vercel.com](https://vercel.com) → **Add New Project** → importa **lol3gg/basket**
2. Framework: **Vite** (auto-rilevato)
3. **Environment Variables** → aggiungi:
   - `VITE_ABLY_KEY` = la tua chiave Ably ([ably.com](https://ably.com) → API Keys)
   - `VITE_APP_URL` = `https://basket-three-kappa.vercel.app` (link inviti WhatsApp)
4. **Deploy**

Ogni push su `main` ridistribuisce l'app in automatico.

In alternativa da terminale (dopo `npx vercel login`):

```powershell
.\deploy-vercel.ps1
```

### Banditore

- Apri l'URL Vercel **dal PC** (non dal cellulare)
- Codice stanza + password banditore (`carletti`)
- Setup → nomi allenatori → **Condividi tutti** su WhatsApp

Gli allenatori ricevono il link personale; la password banditore non va condivisa.

## Sviluppo locale

```bash
npm install
cp .env.example .env
# Inserisci VITE_ABLY_KEY in .env
npm run dev
```

Senza `VITE_ABLY_KEY` l'app usa la modalità locale (un solo dispositivo).
