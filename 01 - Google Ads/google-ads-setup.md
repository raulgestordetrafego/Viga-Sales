# Viga Sales — Configuracoes Centralizadas

## Google Ads API

Credenciais OAuth + Developer Token centralizadas em `google-ads.yaml`.

### Contas gerenciadas via MCC `660-220-9925`

| Cliente | Customer ID | Pasta |
|---|---|---|
| Casa da Fé | 9307821350 (conta própria, também é MCC) | `A Casa da Fé/google-ads-automation/` |
| Aura Lava Jato | 7914536213 | `Aura Lava Jato/google-ads-automation/` |

### Para adicionar um novo cliente

1. Copiar `google-ads.yaml` para `[Cliente]/google-ads-automation/`
2. Copiar os scripts base da pasta de qualquer cliente
3. Substituir `CUSTOMER_ID` nos scripts Python pelo ID da nova conta
4. Rodar `test_connection.py` para validar

### Credenciais

- **Developer Token:** `cAuzd2nM3d8-chZTjNW2nQ`
- **GCP Project:** `686246801610`
- **MCC:** `6602209925` (Viga Sales)
- **Casa da Fé:** `9307821350` (conta própria com manager próprio)
- **App OAuth:** Google Ads API — Desktop App
