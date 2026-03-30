/**
 * 🚀 PASSO A PASSO PARA CONFIGURAR A NUVEM GOMEZ CLUB:
 * 
 * 1. Crie uma nova Planilha no seu Google Drive.
 * 2. No menu superior, clique em: EXTENSÕES > APPS SCRIPT.
 * 3. Apague todo o código que estiver lá e COLE este código aqui.
 * 4. Clique no ícone de DISQUETE (Salvar) e dê um nome (ex: "Sincronizador Gomez").
 * 5. Clique no botão azul: IMPLANTAR (ou DEPLOY) > NOVA IMPLANTAÇÃO.
 * 6. No ícone de engrenagem, escolha: APP DA WEB.
 * 7. Em "Quem pode acessar", escolha: QUALQUER PESSOA (sem isso não funciona!).
 * 8. Clique em IMPLANTAR. O Google vai pedir para "Autorizar acesso".
 * 9. Clique em "Configurações Avançadas" e depois em "Ir para Sincronizador (não seguro)".
 * 10. No final, copie a URL gerada e cole no seu App Gomez Club.
 */

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data;
  
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    // Fallback para outros formatos de postData
    data = JSON.parse(e.postData.getDataAsString());
  }
  
  // Limpa e sobrescreve para manter sincronizado (Simples)
  sheet.clear();
  if (data.length > 0) {
    var headers = Object.keys(data[0]);
    sheet.appendRow(headers);
    
    data.forEach(function(row) {
      var values = headers.map(function(h) { return row[h]; });
      sheet.appendRow(values);
    });
  }
  
  return ContentService.createTextOutput("Sucesso").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rows = sheet.getDataRange().getValues();
  
  if (rows.length === 0) return createResponse([], e);
  
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
  if (e.parameter.callback) {
    // JSONP: Bypasses CORS
    return ContentService.createTextOutput(e.parameter.callback + "(" + result + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
}
