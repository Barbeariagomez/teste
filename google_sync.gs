/**
 * 🚀 VERSÃO 2.0 - SINCRONIZAÇÃO INTELIGENTE (SEM PERDA DE DADOS)
 * COPIE TODO ESTE CÓDIGO E COLE NO SEU APPS SCRIPT.
 * LEMBRE DE: IMPLANTAR > NOVA IMPLANTAÇÃO > APP DA WEB (QUALQUER PESSOA).
 */

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0];
  var data;
  
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    data = JSON.parse(e.postData.getDataAsString());
  }
  
  if (!data || data.length === 0) return createResponse({status: "Nada para salvar"}, e);

  // 1. Pega os cabeçalhos (baseado na primeira linha enviada)
  var headers = Object.keys(data[0]);
  
  // 2. Tenta ler o que já existe na planilha
  var existingContent = sheet.getDataRange().getValues();
  var sheetHeaders = existingContent.length > 0 ? existingContent[0] : [];
  
  // Se a planilha estiver vazia, escreve os cabeçalhos
  if (sheetHeaders.length === 0) {
    sheet.appendRow(headers);
    sheetHeaders = headers;
  }

  // Mapa de IDs existentes para saber onde atualizar
  var idMap = {};
  for (var i = 1; i < existingContent.length; i++) {
    var rowId = existingContent[i][0]; // Assume que o ID é a PRIMEIRA coluna
    idMap[rowId] = i + 1; // Guarda o número da linha
  }

  // 3. Processa cada linha enviada
  data.forEach(function(item) {
    var rowValues = headers.map(function(h) { return item[h] || ""; });
    var itemId = item.id;
    
    if (idMap[itemId]) {
      // Já existe: Atualiza a linha
      var range = sheet.getRange(idMap[itemId], 1, 1, rowValues.length);
      range.setValues([rowValues]);
    } else {
      // Novo: Adiciona no final
      sheet.appendRow(rowValues);
    }
  });
  
  return createResponse({status: "Sucesso", rowsSaved: data.length}, e);
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  
  if (rows.length < 2) return createResponse([], e);
  
  var headers = rows.shift();
  var data = rows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i];
    });
    return obj;
  });
  
  return createResponse(data, e);
}

function createResponse(data, e) {
  var result = JSON.stringify(data);
  if (e.parameter && e.parameter.callback) {
    return ContentService.createTextOutput(e.parameter.callback + "(" + result + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
}
