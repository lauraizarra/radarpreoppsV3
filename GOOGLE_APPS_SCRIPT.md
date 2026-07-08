# Apps Script — Snapshot semanal y Activities Log

Este archivo documenta la automatización recomendada para el Google Sheet operativo.

## Orden de ejecución recomendado

1. `crearWeeklySnapshot` todos los lunes entre 9:00 p.m. y 10:00 p.m.
2. `actualizarActivitiesLog` todos los lunes entre 10:00 p.m. y 11:00 p.m.

`Weekly_Snapshot` guarda historia congelada. No debe actualizar filas viejas.

## Script: Snapshot semanal

Pegar en Extensiones → Apps Script.

```javascript
function crearWeeklySnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName('Config');
  const actualSheet = ss.getSheetByName('PreOpps_Actual');
  const snapshotSheet = ss.getSheetByName('Weekly_Snapshot');

  if (!config || !actualSheet || !snapshotSheet) {
    throw new Error('Faltan pestañas requeridas: Config, PreOpps_Actual o Weekly_Snapshot.');
  }

  const cfg = getConfigMap_(config);
  const semanaId = cfg['Semana actual'] || cfg['Semana Actual'];
  const semanaLabel = cfg['Semana actual label'] || cfg['Semana Actual Label'] || semanaId;
  const fechaCorte = new Date();

  if (!semanaId) throw new Error('Config debe tener el parámetro "Semana actual".');

  const actualData = getSheetData_(actualSheet);
  const existing = snapshotSheet.getDataRange().getValues();
  const existingSemanaIds = existing.slice(1).map(row => String(row[0] || '').trim());

  if (existingSemanaIds.includes(String(semanaId).trim())) {
    throw new Error('Ya existe snapshot para ' + semanaId + '. Si necesitas rehacerlo, borra primero las filas de esa semana en Weekly_Snapshot.');
  }

  const output = [];

  actualData.forEach(row => {
    const source = getValue_(row, ['Source_PreOpp', 'Source']);
    const id = getValue_(row, ['ID_PreOpp', 'ID negocio', 'ID de registro', 'Record ID', 'ID']);

    if (!id) return;
    if (source !== 'Escala 24x7 PreOpps' && source !== 'Escala 24x7 Preopp') return;

    output.push([
      semanaId,
      semanaLabel,
      fechaCorte,
      id,
      source,
      getValue_(row, ['Region', 'Región']),
      getValue_(row, ['Vendedor', 'Propietario del negocio', 'Owner']),
      getValue_(row, ['Cuenta_Dashboard', 'Associated Company (Primary)', 'Cuenta']),
      getValue_(row, ['Producto_PreOpp', 'Associated Product', 'Producto']),
      getValue_(row, ['Etapa_Real', 'Etapa real']),
      getValue_(row, ['Estado_Dashboard', 'Estado dashboard']),
      getValue_(row, ['Icono_Estado', 'Icono Estado']),
      toNumber_(getValue_(row, ['Pipeline_Esperado'])),
      toNumber_(getValue_(row, ['Pipeline_Logrado', 'Net Revenue'])),
      toNumber_(getValue_(row, ['Numero_Actividades', 'Número Actividades'])),
      getValue_(row, ['Ultima_Actividad', 'Fecha_Ultima_Modificacion', 'Fecha de entrada en la etapa actual']),
      getValue_(row, ['Motivo_Descarte_PreOpp', 'Motivo de descarte']),
      getValue_(row, ['Link_HubSpot', 'Link_PreOpp'])
    ]);
  });

  if (!output.length) throw new Error('No hay filas con Source = Escala 24x7 PreOpps para copiar.');

  snapshotSheet
    .getRange(snapshotSheet.getLastRow() + 1, 1, output.length, output[0].length)
    .setValues(output);
}

function crearTriggerSnapshotLunes() {
  borrarTriggerFuncion_('crearWeeklySnapshot');
  ScriptApp.newTrigger('crearWeeklySnapshot')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(21)
    .create();
}

function getConfigMap_(sheet) {
  const values = sheet.getDataRange().getValues();
  const map = {};
  values.forEach(row => {
    const key = String(row[0] || '').trim();
    if (key) map[key] = row[1];
  });
  return map;
}

function getSheetData_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => obj[header] = row[index]);
    return obj;
  });
}

function getValue_(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') return row[name];
  }
  return '';
}

function toNumber_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(String(value).replace(/[$,]/g, '').trim()) || 0;
}

function borrarTriggerFuncion_(functionName) {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) ScriptApp.deleteTrigger(trigger);
  });
}
```

## Configuración del trigger

Ejecuta una sola vez `crearTriggerSnapshotLunes` desde Apps Script. Quedará programado todos los lunes en la franja de 9:00 p.m. a 10:00 p.m.
