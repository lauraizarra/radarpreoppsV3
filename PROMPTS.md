# Prompts / instrucciones de mantenimiento

## Fuente de datos

No publicar pestañas de Google Sheets. La app lee datos mediante Apps Script Web App con token.

Variables necesarias:

```text
PREOPP_API_BASE_URL
PREOPP_API_TOKEN
```

## Pestañas esperadas en Google Sheets

- `Vercel_View`: fuente principal para Pre-oportunidades y Convertidas.
- `Activities_Log`: fuente para el popup de detalles.
- `Weekly_Snapshot`: histórico semanal usado para construir `Vercel_View`.
- `Overview_Matrix`: puede usarse como control visual, aunque la app consolida Overview desde `Vercel_View`.

## Páginas visibles

- Overview
- Pre-oportunidades
- Convertidas

## Reglas

- Source válido: `Escala 24x7 PreOpps` o `Escala 24x7 Preopp`.
- Las tablas de Pre-oportunidades y Convertidas deben mostrar `Etapa_Real` esta semana y `Etapa_Real` semana pasada.
- Las actividades del popup vienen de `Activities_Log`; no de CSV público.
