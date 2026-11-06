const mensagens = document.getElementById("mensagens");
const formulario = document.getElementById("formulario");
const campo = document.getElementById("campo");
const rosto = document.getElementById("rosto");
const textoStatus = document.getElementById("texto-status");
const botaoEnviar = formulario.querySelector("button[type='submit']");

const ITERACOES_PBKDF2 = 310000;
let etapa = "conversa";
let operacao = "";
let mensagemPendente = "";

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
  if (partes.length !== 4 || partes[0] !== "HARU2") {
    throw new Error("Formato de código não reconhecido.");
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

function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function reconhecerPedido(texto) {
  if (texto.startsWith("HARU2:")) {
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
  etapa = "senha";
  configurarCampo("password", "Senha compartilhada (mínimo 8 caracteres)");
  return "Digite a senha compartilhada com a outra pessoa. Envie-a por um canal separado do código.";
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
  if (etapa === "mensagem") {
    mensagemPendente = texto;
    return pedirSenha();
  }
  if (etapa === "codigo") {
    mensagemPendente = texto;
    return pedirSenha();
  }
  if (etapa === "senha") {
    if (texto.length < 8) {
      return "Use uma senha compartilhada com pelo menos 8 caracteres.";
    }
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("Abra o Haru pelo endereço HTTPS do GitHub Pages para usar a criptografia segura.");
    }

    if (operacao === "criptografar") {
      const codigo = await criptografar(mensagemPendente, texto);
      etapa = "conversa";
      operacao = "";
      mensagemPendente = "";
      configurarCampo("text", "Ex.: criptografar texto: minha mensagem");
      return "Mensagem criptografada. Envie este código e compartilhe a senha por outro canal:\n\n" + codigo;
    }

    try {
      const original = await descriptografar(mensagemPendente, texto);
      etapa = "conversa";
      operacao = "";
      mensagemPendente = "";
      configurarCampo("text", "Ex.: criptografar texto: minha mensagem");
      return original;
    } catch (erro) {
      return "Senha incorreta ou código inválido. Confira o código e tente novamente.";
    }
  }

  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error("Abra o Haru pelo endereço HTTPS do GitHub Pages para usar a criptografia segura.");
  }

  const pedido = reconhecerPedido(texto);
  if (!pedido) {
    return "Para criptografar, escreva “criptografar texto: sua mensagem” ou “preciso mandar uma mensagem criptografada”. Para ler, cole o código começando com “HARU2:” ou escreva “descriptografar: código”.";
  }

  operacao = pedido.operacao;
  mensagemPendente = pedido.conteudo;
  if (!mensagemPendente) {
    etapa = operacao === "criptografar" ? "mensagem" : "codigo";
    configurarCampo("text", operacao === "criptografar" ? "Digite a mensagem" : "Cole o código HARU2 recebido");
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

formulario.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const texto = campo.value.trim();
  if (!texto) {
    return;
  }

  adicionarMensagem(campo.type === "password" ? "••••••••" : texto, "usuario");
  campo.value = "";
  botaoEnviar.disabled = true;
  mudarEstado("pensando", "Trabalhando…");

  try {
    const resposta = await responder(texto);
    const balao = adicionarMensagem(resposta, "ia");
    const codigo = resposta.match(/HARU2:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+/);
    if (codigo) {
      adicionarBotaoCopiar(balao, codigo[0]);
    }
  } catch (erro) {
    adicionarMensagem(erro.message || "Não foi possível concluir a operação.", "ia");
  } finally {
    botaoEnviar.disabled = false;
    mudarEstado("ocioso", "Pronta para criptografar");
    campo.focus();
  }
});

adicionarMensagem("ola o que vamos, criptografar hoje ?", "ia");
