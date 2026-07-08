# PreOpp Radar — v17 API privada Apps Script

Dashboard operativo con 3 pestañas visibles:

- Overview
- Pre-oportunidades
- Convertidas

Esta versión **no usa pestañas publicadas como CSV**. Lee la información desde una Web App de Google Apps Script que expone JSON protegido con token.

## Variables de entorno en Vercel

Configura estas variables en Project → Settings → Environment Variables:

```text
PREOPP_API_BASE_URL=https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec
PREOPP_API_TOKEN=TU_TOKEN_PRIVADO
```

No uses `NEXT_PUBLIC_` para estas variables. El token debe quedarse del lado servidor.

## Vistas que debe devolver Apps Script

La API debe responder:

```text
?view=preopps&token=...
?view=activities&token=...
```

- `preopps` lee la pestaña `Vercel_View`.
- `activities` lee la pestaña `Activities_Log`.

## Lógica visual

En `Pre-oportunidades` y `Convertidas`, la tabla compara:

- `Etapa_Real` de esta semana
- `Etapa_Real` de semana pasada
- pipeline esta semana
- pipeline semana pasada
- variación
- botón Ver detalles

El popup toma actividades desde `Activities_Log` y muestra el botón `Ver actividades en HubSpot` usando `Link_PreOpp` o `Link_HubSpot`.

## Deploy

1. Sube este repositorio a GitHub.
2. En Vercel, importa el repo o redeploya el existente.
3. Agrega las variables de entorno.
4. Haz redeploy.


## v18 fix API headers

Esta versión corrige la lectura de la API privada de Apps Script. La API devuelve columnas como `Cuenta_Dashboard`, `Etapa_Esta_Semana` y `Pipeline_Logrado_Esta_Semana`; la app ahora normaliza esos encabezados antes de mapearlos, para evitar que el dashboard quede en cero aunque la API devuelva filas.

Variables requeridas en Vercel:
- `PREOPP_API_BASE_URL`
- `PREOPP_API_TOKEN`


## v19 - fix dashboard vacío
- Las páginas de Next.js se fuerzan como dinámicas (`dynamic = "force-dynamic"`, `revalidate = 0`) para que Vercel no sirva una versión estática/cacheada en cero.
- El loader ahora muestra en el sidebar cuántas filas recibió desde Apps Script.
- Se robusteció el mapeo de cuenta usando `Cuenta_Dashboard` y fallback si `Cuenta` viene vacía.
