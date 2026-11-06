// Peças da tela
const mensagens = document.getElementById("mensagens");
const formulario = document.getElementById("formulario");
const campo = document.getElementById("campo");
const rosto = document.getElementById("rosto");
const textoStatus = document.getElementById("texto-status");

// Coloca uma mensagem na tela. O autor é "usuario" ou "ia".
function adicionarMensagem(texto, autor) {
  const balao = document.createElement("div");
  balao.className = "msg " + autor;
  balao.textContent = texto;
  mensagens.appendChild(balao);
  mensagens.scrollTop = mensagens.scrollHeight;
  return balao;
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

// Muda o rosto e o texto embaixo do nome. O estado é "ocioso" ou "pensando".
function mudarEstado(estado, texto) {
  rosto.dataset.estado = estado;
  textoStatus.textContent = texto;
}

// Envia o texto ao Python e espera a resposta.
// Quando o programa abre pelo .exe, o pywebview cria window.pywebview.api.
// Se abrir só no navegador (para testar o visual), devolve um aviso.
async function pedirRespostaAoPython(texto) {
  if (window.pywebview && window.pywebview.api) {
    return await window.pywebview.api.responder(texto);
  }
  return "Modo de teste: o Python ainda não está conectado.";
}

// Quando a pessoa envia a mensagem
formulario.addEventListener("submit", async function (evento) {
  evento.preventDefault();

  const texto = campo.value.trim();
  if (texto === "") {
    return;
  }

  adicionarMensagem(
    campo.type === "password" ? "••••••••" : texto,
    "usuario"
  );
  campo.value = "";
  mudarEstado("pensando", "Trabalhando…");

  try {
    const resposta = await pedirRespostaAoPython(texto);
    if (typeof resposta === "object" && resposta !== null) {
      adicionarMensagem(resposta.message, "ia");
      campo.type = resposta.input_type || "text";
      campo.autocomplete = campo.type === "password" ? "new-password" : "off";
      campo.placeholder = campo.type === "password"
        ? "Senha compartilhada"
        : "Ex.: criptografar texto: minha mensagem";
    } else {
      const codigo = resposta.match(/HARU1:[A-Za-z0-9_=-]+:[A-Za-z0-9_=-]+/);
      const balao = adicionarMensagem(resposta, "ia");
      if (codigo) {
        const botaoCopiar = document.createElement("button");
        botaoCopiar.className = "copiar-codigo";
        botaoCopiar.type = "button";
        botaoCopiar.textContent = "Copiar código";
        botaoCopiar.addEventListener("click", async function () {
          try {
            await copiarTexto(codigo[0]);
            botaoCopiar.textContent = "Copiado!";
          } catch (erro) {
            botaoCopiar.textContent = "Não foi possível copiar";
          }
        });
        balao.appendChild(botaoCopiar);
      }
      campo.type = "text";
      campo.autocomplete = "off";
      campo.placeholder = "Ex.: criptografar texto: minha mensagem";
    }
  } catch (erro) {
    adicionarMensagem("Algo deu errado ao falar com o Python. Tente de novo.", "ia");
  }

  mudarEstado("ocioso", "Pronta para criptografar");
});

// Primeira mensagem ao abrir
adicionarMensagem(
  "ola o que vamos, criptografar hoje ?",
  "ia"
);
