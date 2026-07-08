# PreOpp Radar v20

Versión ajustada para mantener una sola acción de HubSpot dentro del popup:

- El botón superior **Ver actividades en HubSpot** usa primero `Link_HubSpot` de `Vercel_View`.
- Si `Link_HubSpot` viene vacío, usa el primer `Link_PreOpp` disponible en `Activities_Log` para la misma `ID_PreOpp`.
- El footer del popup deja solo el botón **Cerrar**.
- Mantiene lectura privada desde Apps Script con `PREOPP_API_BASE_URL` y `PREOPP_API_TOKEN`.

## Variables de entorno en Vercel

```text
PREOPP_API_BASE_URL=https://script.google.com/macros/s/XXXXXXXX/exec
PREOPP_API_TOKEN=tu_token_privado
```

Sin `NEXT_PUBLIC_`, sin comillas y sin parámetros `?view=` ni `&token=`.


## v21
- Ajuste visual: tarjetas KPI más compactas en Overview, Pre-oportunidades y Convertidas.
- Se redujo alto, padding, tamaño de iconos y espaciado para vista laptop.
