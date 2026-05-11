# Security Hardening Checklist

## 1. Authentication
- Set `MW_AUTH_LEVEL=function` in Function App settings.
- Use Function key from frontend only in controlled environment.
- Prefer API Management in front of Functions for production.

## 2. Rate Limiting
- Set `MW_ENABLE_RATE_LIMIT=1`.
- Optional tuning:
  - `MW_RATE_WINDOW_MS` (default: `60000`)
  - `MW_RATE_LIMIT_PER_WINDOW` (default: `120`)

## 3. CORS
- Set `CORS_ALLOWED_ORIGINS` as comma-separated origins.
- Example:
  - `https://your-app.example.com,https://staging.example.com`

## 4. Secrets Management (Key Vault)
- Do not store keys in source files.
- Move app settings to Key Vault references:
  - `AZURE_OPENAI_API_KEY=@Microsoft.KeyVault(SecretUri=...)`
  - `OPENAI_COMPAT_API_KEY=@Microsoft.KeyVault(SecretUri=...)`

## 5. Data Handling
- Meeting text is sent to AI providers.
- Add user-facing policy text for:
  - data processing purpose
  - retention
  - provider list

## 6. Debug Safety
- Keep browser debug mode disabled in production.
- Internal dictionary/dispatcher details are returned only when `includeDebug=true`.
