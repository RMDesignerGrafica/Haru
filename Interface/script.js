const mensagens = document.getElementById("mensagens");
const formulario = document.getElementById("formulario");
const campo = document.getElementById("campo");
const rosto = document.getElementById("rosto");
const textoStatus = document.getElementById("texto-status");
const botaoEnviar = formulario.querySelector("button[type='submit']");
const botoesAcao = document.querySelectorAll(".acao-chat");
const entradaArquivoCriptografar = document.getElementById("arquivo-para-criptografar");
const entradaArquivoDescriptografar = document.getElementById("arquivo-para-descriptografar");

const ITERACOES_PBKDF2 = 310000;
const TAMANHO_MAXIMO_ARQUIVO = 50 * 1024 * 1024;
const CABECALHO_ARQUIVO = new TextEncoder().encode("HARUFILE1");
let etapa = "conversa";
let operacao = "";
let mensagemPendente = "";
let arquivoPendente = null;

function adicionarMensagem(texto, autor) {
  const balao = document.createElement("div");
  balao.className = "msg " + autor;
  balao.textContent = texto;
  mensagens.appendChild(balao);
  mensagens.scrollTop = mensagens.scrollHeight;
  return balao;
}

function mudarEstado(estado, texto) {
  rosto.dataset.estado = estado;
  textoStatus.textContent = texto;
}

function configurarCampo(tipo, placeholder) {
  campo.type = tipo;
  campo.autocomplete = tipo === "password" ? "new-password" : "off";
  campo.placeholder = placeholder;
  campo.setAttribute("aria-label", placeholder);
}

async function copiarTexto(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }

  const temporario = document.createElement("textarea");
  temporario.value = texto;
  temporario.setAttribute("readonly", "");
  temporario.style.position = "fixed";
  temporario.style.opacity = "0";
  document.body.appendChild(temporario);
  temporario.select();
  const copiado = document.execCommand("copy");
  temporario.remove();

  if (!copiado) {
    throw new Error("Não foi possível copiar o código.");
  }
}

function codificarBase64Url(bytes) {
  let binario = "";
  for (let inicio = 0; inicio < bytes.length; inicio += 0x8000) {
    const parte = bytes.subarray(inicio, Math.min(inicio + 0x8000, bytes.length));
    binario += String.fromCharCode(...parte);
  }
  return btoa(binario)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodificarBase64Url(valor) {
  if (!/^[A-Za-z0-9_-]+$/.test(valor)) {
    throw new Error("Código inválido.");
  }

  const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binario, caractere => caractere.charCodeAt(0));
}

async function derivarChave(senha, sal) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: sal, iterations: ITERACOES_PBKDF2, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function criptografar(texto, senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await derivarChave(senha, sal);
  const cifra = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    chave,
    new TextEncoder().encode(texto)
  );
  return [
    "HARU2",
    codificarBase64Url(sal),
    codificarBase64Url(iv),
    codificarBase64Url(new Uint8Array(cifra))
  ].join(":");
}

async function descriptografar(codigo, senha) {
  const partes = codigo.split(":");
  if (partes[0] === "HARU2") {
    if (partes.length !== 4) {
      throw new Error("Formato de código inválido.");
    }

    const sal = decodificarBase64Url(partes[1]);
    const iv = decodificarBase64Url(partes[2]);
    const cifra = decodificarBase64Url(partes[3]);
    if (sal.length !== 16 || iv.length !== 12 || cifra.length < 16) {
      throw new Error("Formato de código inválido.");
    }

    const chave = await derivarChave(senha, sal);
    const texto = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, chave, cifra);
    return new TextDecoder().decode(texto);
  }

  if (partes.length !== 9 || partes[0] !== "HARU3") {
    throw new Error("Formato de código não reconhecido.");
  }

  const salIndividual = decodificarBase64Url(partes[1]);
  const ivIndividual = decodificarBase64Url(partes[2]);
  const chaveIndividualCifrada = decodificarBase64Url(partes[3]);
  const salMestre = decodificarBase64Url(partes[4]);
  const ivMestre = decodificarBase64Url(partes[5]);
  const chaveMestreCifrada = decodificarBase64Url(partes[6]);
  const ivMensagem = decodificarBase64Url(partes[7]);
  const cifra = decodificarBase64Url(partes[8]);
  if (
    salIndividual.length !== 16 || salMestre.length !== 16 ||
    ivIndividual.length !== 12 || ivMestre.length !== 12 ||
    chaveIndividualCifrada.length !== 48 || chaveMestreCifrada.length !== 48 ||
    ivMensagem.length !== 12 || cifra.length < 16
  ) {
    throw new Error("Formato de código inválido.");
  }

  const tentativas = [
    { sal: salIndividual, iv: ivIndividual, cifra: chaveIndividualCifrada },
    { sal: salMestre, iv: ivMestre, cifra: chaveMestreCifrada }
  ];
  let chaveMensagem;
  for (const tentativa of tentativas) {
    try {
      const chaveDerivada = await derivarChave(senha, tentativa.sal);
      const chaveRaw = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: tentativa.iv },
        chaveDerivada,
        tentativa.cifra
      );
      chaveMensagem = await crypto.subtle.importKey(
        "raw",
        chaveRaw,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      break;
    } catch (erro) {
      if (tentativa === tentativas[tentativas.length - 1]) {
        throw erro;
      }
    }
  }

  if (!chaveMensagem) {
    throw new Error("Senha incorreta ou código inválido.");
  }
  const texto = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivMensagem },
    chaveMensagem,
    cifra
  );
  return new TextDecoder().decode(texto);
}

function arquivoEhSuportado(arquivo) {
  const extensao = arquivo.name.toLowerCase().split(".").pop();
  return arquivo.type === "application/pdf" ||
    arquivo.type.startsWith("image/") ||
    extensao === "pdf" ||
    ["avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp"].includes(extensao);
}

async function criptografarArquivo(arquivo, senha) {
  const conteudoOriginal = new Uint8Array(await arquivo.arrayBuffer());
  const metadados = new TextEncoder().encode(JSON.stringify({
    name: arquivo.name,
    type: arquivo.type || "application/octet-stream"
  }));
  const textoClaro = new Uint8Array(4 + metadados.length + conteudoOriginal.length);
  new DataView(textoClaro.buffer).setUint32(0, metadados.length);
  textoClaro.set(metadados, 4);
  textoClaro.set(conteudoOriginal, 4 + metadados.length);

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await derivarChave(senha, sal);
  const cifra = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    chave,
    textoClaro
  ));
  const recipiente = new Uint8Array(
    CABECALHO_ARQUIVO.length + sal.length + iv.length + cifra.length
  );
  recipiente.set(CABECALHO_ARQUIVO);
  recipiente.set(sal, CABECALHO_ARQUIVO.length);
  recipiente.set(iv, CABECALHO_ARQUIVO.length + sal.length);
  recipiente.set(cifra, CABECALHO_ARQUIVO.length + sal.length + iv.length);
  return new Blob([recipiente], { type: "application/octet-stream" });
}

async function descriptografarArquivo(arquivo, senha) {
  const recipiente = new Uint8Array(await arquivo.arrayBuffer());
  const tamanhoCabecalho = CABECALHO_ARQUIVO.length;
  const deslocamentoIv = tamanhoCabecalho + 16;
  const deslocamentoCifra = deslocamentoIv + 12;
  if (
    recipiente.length <= deslocamentoCifra + 16 ||
    !CABECALHO_ARQUIVO.every((byte, indice) => recipiente[indice] === byte)
  ) {
    throw new Error("O arquivo não é um arquivo Haru protegido válido.");
  }

  const sal = recipiente.slice(tamanhoCabecalho, deslocamentoIv);
  const iv = recipiente.slice(deslocamentoIv, deslocamentoCifra);
  const chave = await derivarChave(senha, sal);
  let textoClaro;
  try {
    textoClaro = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      chave,
      recipiente.subarray(deslocamentoCifra)
    ));
  } catch (erro) {
    throw new Error("Senha incorreta ou arquivo protegido danificado.");
  }

  if (textoClaro.length < 4) {
    throw new Error("O arquivo protegido está incompleto ou danificado.");
  }
  const tamanhoMetadados = new DataView(
    textoClaro.buffer,
    textoClaro.byteOffset,
    textoClaro.byteLength
  ).getUint32(0);
  if (tamanhoMetadados === 0 || tamanhoMetadados > textoClaro.length - 4) {
    throw new Error("Os dados do arquivo protegido são inválidos.");
  }

  let metadados;
  try {
    metadados = JSON.parse(new TextDecoder().decode(textoClaro.subarray(4, 4 + tamanhoMetadados)));
  } catch (erro) {
    throw new Error("Os dados do arquivo protegido são inválidos.");
  }
  if (
    typeof metadados.name !== "string" ||
    typeof metadados.type !== "string" ||
    !metadados.name ||
    metadados.name.includes("/") ||
    metadados.name.includes("\\")
  ) {
    throw new Error("O nome original do arquivo protegido é inválido.");
  }

  const conteudo = textoClaro.slice(4 + tamanhoMetadados);
  if (conteudo.length > TAMANHO_MAXIMO_ARQUIVO) {
    throw new Error("O arquivo descriptografado excede o limite de 50 MB.");
  }
  return {
    name: metadados.name,
    blob: new Blob([conteudo], { type: metadados.type })
  };
}

function adicionarBotaoDownload(balao, blob, nomeArquivo, textoBotao) {
  const link = document.createElement("a");
  link.className = "copiar-codigo";
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo;
  link.textContent = textoBotao;
  link.addEventListener("click", function () {
    window.setTimeout(() => URL.revokeObjectURL(link.href), 60000);
  }, { once: true });
  balao.appendChild(link);
}

function prepararSeletorArquivo(arquivo, novaOperacao) {
  arquivoPendente = null;
  mensagemPendente = "";
  operacao = novaOperacao;
  etapa = "arquivo-senha";

  if (!arquivo) {
    etapa = "conversa";
    operacao = "";
    return;
  }

  if (novaOperacao === "criptografar-arquivo") {
    if (!arquivoEhSuportado(arquivo)) {
      etapa = "conversa";
      operacao = "";
      adicionarMensagem("Escolha uma imagem ou um arquivo PDF.", "ia");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
      etapa = "conversa";
      operacao = "";
      adicionarMensagem("Este arquivo excede o limite de 50 MB. Escolha um arquivo menor.", "ia");
      return;
    }
  } else if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO + 1024 * 1024) {
    etapa = "conversa";
    operacao = "";
    adicionarMensagem("O arquivo protegido excede o limite aceito de 51 MB.", "ia");
    return;
  }

  arquivoPendente = arquivo;
  adicionarMensagem("Arquivo selecionado: " + arquivo.name, "usuario");
  configurarCampo("password", "Senha do arquivo (mínimo 8 caracteres)");
  adicionarMensagem("Digite a senha do arquivo. Quem receber precisará da mesma senha para abri-lo.", "ia");
}

function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function reconhecerPedido(texto) {
  if (texto.startsWith("HARU2:") || texto.startsWith("HARU3:")) {
    return { operacao: "descriptografar", conteudo: texto };
  }

  const separador = texto.indexOf(":");
  const comando = normalizar(separador < 0 ? texto : texto.slice(0, separador));
  const conteudo = separador < 0 ? "" : texto.slice(separador + 1).trim();
  const comandosCriptografar = [
    "criptografar",
    "criptografar texto",
    "preciso mandar uma mensagem criptografada",
    "preciso de uma mensagem escondida"
  ];
  const comandosDescriptografar = [
    "descriptografar",
    "descriptografar mensagem",
    "preciso ler uma mensagem escondida"
  ];

  if (comandosCriptografar.includes(comando)) {
    return { operacao: "criptografar", conteudo };
  }
  if (comandosDescriptografar.includes(comando)) {
    return { operacao: "descriptografar", conteudo };
  }
  return null;
}

function pedirSenha() {
  if (operacao === "criptografar") {
    etapa = "senha-individual";
    configurarCampo("password", "Senha desta mensagem (mínimo 8 caracteres)");
    return "Crie uma senha para esta mensagem. A mesma senha será necessária para abri-la.";
  }

  etapa = "senha-leitura";
  configurarCampo("password", "Senha da mensagem");
  return "Digite a senha usada para criptografar esta mensagem.";
}

function adicionarBotaoCopiar(balao, codigo) {
  const botaoCopiar = document.createElement("button");
  botaoCopiar.className = "copiar-codigo";
  botaoCopiar.type = "button";
  botaoCopiar.textContent = "Copiar código";
  botaoCopiar.addEventListener("click", async function () {
    try {
      await copiarTexto(codigo);
      botaoCopiar.textContent = "Copiado!";
    } catch (erro) {
      botaoCopiar.textContent = "Não foi possível copiar";
    }
  });
  balao.appendChild(botaoCopiar);
}

async function responder(texto) {
  if (etapa === "arquivo-senha") {
    if (texto.length < 8) {
      return "Use uma senha com pelo menos 8 caracteres.";
    }
    if (!arquivoPendente) {
      etapa = "conversa";
      operacao = "";
      configurarCampo("text", "Escolha uma ação acima para começar");
      return "Selecione o arquivo novamente para continuar.";
    }
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("Abra o Haru pelo endereço HTTPS do GitHub Pages para proteger arquivos.");
    }

    if (operacao === "criptografar-arquivo") {
      const nomeProtegido = arquivoPendente.name + ".haru";
      const blobProtegido = await criptografarArquivo(arquivoPendente, texto);
      arquivoPendente = null;
      etapa = "conversa";
      operacao = "";
      configurarCampo("text", "Escolha uma ação acima para começar");
      const resposta = adicionarMensagem("Arquivo protegido. Baixe-o e envie o arquivo .haru para a outra pessoa:", "ia");
      adicionarBotaoDownload(resposta, blobProtegido, nomeProtegido, "Baixar arquivo protegido");
      return null;
    }

    try {
      const resultado = await descriptografarArquivo(arquivoPendente, texto);
      arquivoPendente = null;
      etapa = "conversa";
      operacao = "";
      configurarCampo("text", "Escolha uma ação acima para começar");
      const resposta = adicionarMensagem("Arquivo aberto. Baixe o arquivo original:", "ia");
      adicionarBotaoDownload(resposta, resultado.blob, resultado.name, "Baixar arquivo original");
      return null;
    } catch (erro) {
      return erro.message || "Não foi possível abrir o arquivo protegido.";
    }
  }

  if (etapa === "mensagem") {
    mensagemPendente = texto;
    return pedirSenha();
  }
  if (etapa === "codigo") {
    mensagemPendente = texto;
    return pedirSenha();
  }
  if (etapa === "senha-individual") {
    if (texto.length < 8) {
      return "Use uma senha com pelo menos 8 caracteres.";
    }
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("Abra o Haru pelo endereço HTTPS do GitHub Pages para usar a criptografia segura.");
    }

    const codigo = await criptografar(mensagemPendente, texto);
    etapa = "conversa";
    operacao = "";
    mensagemPendente = "";
    configurarCampo("text", "Escolha uma ação acima para começar");
    return "Mensagem criptografada. Envie este código e compartilhe a senha por outro canal:\n\n" + codigo;
  }
  if (etapa === "senha-leitura") {
    if (texto.length < 8) {
      return "A senha deve ter pelo menos 8 caracteres.";
    }
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("Abra o Haru pelo endereço HTTPS do GitHub Pages para usar a criptografia segura.");
    }

    try {
      const original = await descriptografar(mensagemPendente, texto);
      etapa = "conversa";
      operacao = "";
      mensagemPendente = "";
      configurarCampo("text", "Escolha uma ação acima para começar");
      return original;
    } catch (erro) {
      return "Senha incorreta ou código inválido. Confira a senha da mensagem e tente novamente.";
    }
  }

  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error("Abra o Haru pelo endereço HTTPS do GitHub Pages para usar a criptografia segura.");
  }

  const pedido = reconhecerPedido(texto);
  if (!pedido) {
    return "Para criptografar, escreva “criptografar texto: sua mensagem” ou “preciso mandar uma mensagem criptografada”. Para ler, cole um código “HARU2:” ou “HARU3:”, ou escreva “descriptografar: código”.";
  }

  operacao = pedido.operacao;
  mensagemPendente = pedido.conteudo;
  if (!mensagemPendente) {
    etapa = operacao === "criptografar" ? "mensagem" : "codigo";
    configurarCampo(
      "text",
      operacao === "criptografar" ? "Digite a mensagem" : "Cole o código HARU2 ou HARU3 recebido"
    );
    return operacao === "criptografar"
      ? "Claro! Qual mensagem você quer criptografar?"
      : "Cole aqui o código criptografado que você recebeu.";
  }

  if (operacao === "descriptografar" && mensagemPendente.startsWith("HARU1:")) {
    operacao = "";
    mensagemPendente = "";
    return "Esse código foi criado pela versão antiga do Haru e não é compatível com a versão web. Peça à outra pessoa para gerar um novo código no Haru online.";
  }

  return pedirSenha();
}

function iniciarOperacao(novaOperacao) {
  operacao = novaOperacao;
  mensagemPendente = "";
  arquivoPendente = null;
  etapa = novaOperacao === "criptografar" ? "mensagem" : "codigo";
  configurarCampo(
    "text",
    novaOperacao === "criptografar" ? "Digite o texto para criptografar" : "Cole o código HARU2 ou HARU3 recebido"
  );
  adicionarMensagem(
    novaOperacao === "criptografar"
      ? "Qual texto você deseja criptografar?"
      : "Cole aqui o código que deseja descriptografar.",
    "ia"
  );
  campo.focus();
}

botoesAcao[0].addEventListener("click", function () {
  iniciarOperacao("criptografar");
});

botoesAcao[1].addEventListener("click", function () {
  iniciarOperacao("descriptografar");
});

document.getElementById("acao-criptografar-arquivo").addEventListener("click", function () {
  entradaArquivoCriptografar.click();
});

document.getElementById("acao-descriptografar-arquivo").addEventListener("click", function () {
  entradaArquivoDescriptografar.click();
});

entradaArquivoCriptografar.addEventListener("change", function () {
  prepararSeletorArquivo(entradaArquivoCriptografar.files[0], "criptografar-arquivo");
  entradaArquivoCriptografar.value = "";
});

entradaArquivoDescriptografar.addEventListener("change", function () {
  prepararSeletorArquivo(entradaArquivoDescriptografar.files[0], "descriptografar-arquivo");
  entradaArquivoDescriptografar.value = "";
});

formulario.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const texto = campo.value.trim();
  if (!texto) {
    return;
  }

  adicionarMensagem(campo.type === "password" ? "••••••••" : texto, "usuario");
  campo.value = "";
  botaoEnviar.disabled = true;
  document.querySelectorAll(".acao-chat").forEach(botao => {
    botao.disabled = true;
  });
  mudarEstado("pensando", "Trabalhando…");

  try {
    const resposta = await responder(texto);
    if (resposta === null) {
      return;
    }
    const balao = adicionarMensagem(resposta, "ia");
    const codigo = resposta.match(
      /(?:HARU2:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+|HARU3:(?:[A-Za-z0-9_-]+:){7}[A-Za-z0-9_-]+)/
    );
    if (codigo) {
      adicionarBotaoCopiar(balao, codigo[0]);
    }
  } catch (erro) {
    adicionarMensagem(erro.message || "Não foi possível concluir a operação.", "ia");
  } finally {
    botaoEnviar.disabled = false;
    document.querySelectorAll(".acao-chat").forEach(botao => {
      botao.disabled = false;
    });
    mudarEstado("ocioso", "Pronta para criptografar");
    campo.focus();
  }
});

adicionarMensagem("ola o que vamos, criptografar hoje ?", "ia");
