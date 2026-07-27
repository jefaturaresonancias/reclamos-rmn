# Reclamos RMN

Sistema de gestión de reclamos de informes de resonancia magnética (RMN) para
el sector administrativo y para los médicos que informan los estudios.

Es una **PWA estática** (HTML/CSS/JS sin build ni frameworks) que se conecta
a una planilla de Google Sheets a través de un **Google Apps Script**
publicado como Web App.

## Roles

| Página | Para quién | Qué hace |
|---|---|---|
| [`index.html`](index.html) | Todos | Landing, elegís el rol (Administrativo / Médico) |
| [`pages/administrativo.html`](pages/administrativo.html) | Administrativo | Carga reclamos, hace seguimiento, entrega informes, gestiona recitados |
| [`pages/medico.html`](pages/medico.html) | Médico | Ve los reclamos pendientes de informar, los resuelve, pide recitación de turno |

## Arquitectura

```
Navegador (PWA)  ──fetch──►  Google Apps Script (Web App)  ──►  Google Sheets
   js/api.js                 appsscript-reclamos/Código.js         (BD)
```

- El frontend no tiene backend propio: todo el estado vive en una hoja de
  cálculo de Google Sheets, y `js/api.js` habla con ella vía HTTP
  (`fetch`) contra la URL del Web App de Apps Script (acciones `list`,
  `stats`, `add`, `update`, `resolver`, `entregar`, `recitar`, etc. — ver
  [`js/api.js`](js/api.js)).
- La URL del Web App **no está hardcodeada**: la primera vez que se abre la
  app en un dispositivo nuevo, pide pegarla (pantalla de configuración en
  `js/api.js`) y la guarda en `localStorage`. Nunca se sube a GitHub.
- El código del backend vive en [`appsscript-reclamos/Código.js`](appsscript-reclamos/Código.js),
  un proyecto de Apps Script aparte, clonado localmente con `clasp` (su
  `.clasp.json`/`.clasprc.json` están en `.gitignore`, no se versionan).

> ⚠️ Este repo también tuvo en algún momento una carpeta `appsscript/`
> apuntando a un proyecto de Apps Script **distinto** (turnos/agenda, no
> reclamos). Si alguna vez aparece esa carpeta de nuevo, no es la de este
> proyecto — el backend real de reclamos es `appsscript-reclamos/`.

## Estructura del repo

```
├── index.html              Landing / selector de rol
├── manifest.json           Manifest de la PWA (íconos, nombre, colores)
├── favicon.ico, icon-*.png Íconos de la app
├── js/
│   └── api.js               Conexión con Apps Script + pantalla de config inicial
├── pages/
│   ├── administrativo.html  Panel administrativo (todo el CSS/JS inline)
│   └── medico.html          Panel médico (todo el CSS/JS inline)
└── appsscript-reclamos/
    ├── Código.js             Backend: doGet/doPost, lectura y escritura en Sheets
    └── appsscript.json       Config del proyecto de Apps Script
```

No hay build step: son HTML sueltos con `<style>`/`<script>` inline,
pensados para servirse tal cual (ej. GitHub Pages).

## Funcionalidades principales

**Reclamos**
- Alta de reclamo (vinculado a un turno existente por DNI, o manual).
- Estados: `pendiente` → `resuelto` (médico informó) → `entregado`
  (administrativo lo entregó). También `revisado-admin` como marca
  intermedia.
- Resolución por región del cuerpo cuando el estudio abarca varias
  (ej. columna completa: cervical + dorsal + lumbar).
- Archivado automático de reclamos con **+3 meses** de antigüedad (se
  calcula en cada `getStats()`), con categoría propia y búsqueda por DNI
  que también los encuentra.

**Recitados** (cuando el paciente necesita un turno nuevo)
- El médico marca un reclamo como "a recitar" con un motivo → pasa a
  `recitar` (esperando que administrativo le asigne turno nuevo).
- Administrativo le asigna fecha → pasa a `recitado` (turno ya asignado,
  vuelve al flujo normal para que el médico lo informe).
- En administrativo, la categoría "Por recitar" del sidebar muestra ambas
  sub-listas en pestañas.

**Navegación (administrativo)**
- Sin tabs fijas: las cajas de estadísticas del costado izquierdo son la
  navegación. Cada una filtra la lista y, si la categoría tiene estados
  relacionados (Resueltos/Entregados, Por recitar/Recitados), muestra
  sub-pestañas propias en vez de mezclar todo.

**Avisos**
- Popup persistente en administrativo cuando el médico informa un
  reclamo: agrupa todos los nuevos en un solo aviso y no se cierra solo —
  hay que confirmarlo. El reconocimiento se guarda en `localStorage`
  (por navegador).
- Sistema de "novedades" (`ANUNCIOS` en cada página): al publicar una
  función nueva, se agrega una entrada con fecha de publicación y se
  muestra un modal durante los 3 días siguientes, una vez por sesión de
  navegador (`sessionStorage`). **Hay que actualizar el array `ANUNCIOS`
  en `administrativo.html` y `medico.html` por separado** — el contenido
  puede (y debe) ser distinto según a quién le importa cada cambio.

## Desarrollo

### Frontend
Son archivos estáticos — para probarlos alcanza con abrirlos en el
navegador o servirlos con cualquier servidor estático. Los cambios se
suben directo a `main` (no hay CI/build).

### Backend (Apps Script)
```bash
cd appsscript-reclamos
clasp pull                          # traer cambios hechos desde el editor web
# ... editar Código.js ...
clasp push                          # subir cambios al proyecto de Apps Script
clasp deployments                   # ver el ID del deployment activo
clasp deploy -i <deploymentId> \    # actualizar ESE deployment (misma URL
  --description "..."               # que ya usa todo el mundo)
```

⚠️ `clasp deploy` sin `-i` crea un deployment **nuevo con URL nueva** — el
personal que ya tiene la URL vieja guardada no vería los cambios. Para que
el cambio quede visible para todos sin que nadie reconfigure nada, hay que
actualizar el deployment existente con `-i`.

### Google Sheets
La hoja `BD` tiene ~40 columnas mapeadas en el objeto `COL` de
`Código.js` (fecha, paciente, estudio, estado del reclamo, campos de
recitación, columna `RECLAMO_ARCHIVADO`, etc.). Si se agrega una columna
nueva a la planilla, hay que sumarla ahí también.

## Notas

- Los colores de "días de retraso" (naranja ≥30 días, rojo ≥90) están
  duplicados en el CSS de `administrativo.html` y `medico.html` — si se
  ajustan los umbrales, hay que tocar ambos archivos.
- `.clasp.json` y `.clasprc.json` de `appsscript-reclamos/` están en
  `.gitignore`: son credenciales/config local de `clasp`, no se suben.
