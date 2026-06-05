# Asta Torneo Basket

App per asta fantabasket di quartiere — banditore su PC/tablet, allenatori su cellulare.

## Online

Dopo il deploy su GitHub Pages l'app è disponibile su:

**https://lol3gg.github.io/basket/**

### Prima pubblicazione (una tantum)

1. Su GitHub → repo **basket** → **Settings** → **Pages** → Source: **GitHub Actions**
2. **Settings** → **Secrets and variables** → **Actions** → New secret:
   - Nome: `VITE_ABLY_KEY`
   - Valore: la tua chiave Ably (da [ably.com](https://ably.com))
3. Ogni push su `main` ridistribuisce l'app automaticamente

## Banditore

- Apri l'app dal PC (non dal cellulare)
- Inserisci **codice stanza** e **password banditore**
- La password non va condivisa con gli allenatori — solo il codice stanza o i link personali

## Allenatori

Entrano dal link personale generato in Setup → **Condividi link**, oppure con codice stanza + nome.

## Sviluppo locale

```bash
npm install
cp .env.example .env
# Inserisci VITE_ABLY_KEY in .env
npm run dev
```

Senza chiave Ably l'app usa la modalità locale (un solo dispositivo).
