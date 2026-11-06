import base64
import os
import sys
import unicodedata

import webview
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt


# ---------- Pastas ----------

def pegar_pasta_do_programa():
    # Quando vira .exe, fica a pasta onde o .exe está.
    # Quando roda como app.py, fica a pasta do app.py.
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def pegar_pasta_da_interface():
    # No .exe, o PyInstaller descompacta a interface em sys._MEIPASS.
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "interface")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "interface")


PASTA_DADOS = os.path.join(pegar_pasta_do_programa(), "Cofre_dados")
os.makedirs(PASTA_DADOS, exist_ok=True)

CAMINHO_CHAVE = os.path.join(PASTA_DADOS, "chave.key")
CAMINHO_CODIGOS = os.path.join(PASTA_DADOS, "codigos.txt")


# ---------- Chave ----------

def carregar_chave():
    # Na primeira vez cria a chave. Nas próximas, só lê a que já existe.
    if not os.path.exists(CAMINHO_CHAVE):
        chave_nova = Fernet.generate_key()
        with open(CAMINHO_CHAVE, "wb") as arquivo:
            arquivo.write(chave_nova)

    with open(CAMINHO_CHAVE, "rb") as arquivo:
        return arquivo.read()


CHAVE = carregar_chave()


# ---------- Criptografia ----------

def criptografar(texto):
    codigo = Fernet(CHAVE).encrypt(texto.encode("utf-8"))
    return codigo.decode("utf-8")


def descriptografar(codigo):
    # Devolve o texto original, ou None se o código não for válido.
    try:
        texto = Fernet(CHAVE).decrypt(codigo.encode("utf-8"))
        return texto.decode("utf-8")
    except InvalidToken:
        return None


def derivar_chave(senha, sal):
    derivador = Scrypt(salt=sal, length=32, n=2**14, r=8, p=1)
    return base64.urlsafe_b64encode(derivador.derive(senha.encode("utf-8")))


def criptografar_com_senha(texto, senha):
    sal = os.urandom(16)
    chave = derivar_chave(senha, sal)
    codigo = Fernet(chave).encrypt(texto.encode("utf-8")).decode("utf-8")
    sal_codificado = base64.urlsafe_b64encode(sal).decode("ascii")
    return f"HARU1:{sal_codificado}:{codigo}"


def descriptografar_com_senha(codigo, senha):
    try:
        versao, sal_codificado, texto_codificado = codigo.split(":", 2)
        if versao != "HARU1":
            return None

        sal = base64.urlsafe_b64decode(sal_codificado.encode("ascii"))
        if len(sal) != 16:
            return None

        chave = derivar_chave(senha, sal)
        texto = Fernet(chave).decrypt(texto_codificado.encode("ascii"))
        return texto.decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError):
        return None


def guardar_codigo(codigo):
    with open(CAMINHO_CODIGOS, "a", encoding="utf-8") as arquivo:
        arquivo.write(codigo + "\n")


# ---------- Conversa com a tela ----------

AJUDA = (
    "Posso ajudar a enviar uma mensagem secreta.\n\n"
    "Para criptografar, diga “preciso mandar uma mensagem criptografada” "
    "ou escreva “criptografar texto: sua mensagem”.\n"
    "Para ler, escreva “descriptografar: código”.\n\n"
    "As duas pessoas precisam combinar a mesma senha por outro canal."
)


def normalizar(texto):
    texto_normalizado = unicodedata.normalize("NFD", texto.lower())
    return "".join(
        caractere
        for caractere in texto_normalizado
        if unicodedata.category(caractere) != "Mn"
    ).strip()


def extrair_intencao(mensagem, intencoes):
    mensagem_normalizada = normalizar(mensagem)
    for intencao in intencoes:
        if mensagem_normalizada == intencao:
            return True, ""
        if mensagem_normalizada.startswith(intencao):
            restante = mensagem[len(intencao):].strip()
            return True, restante.lstrip(" :,-")
    return False, ""


class Api:
    # O JavaScript chama esta função: window.pywebview.api.responder(texto)
    def __init__(self):
        self.etapa = None
        self.operacao = None
        self.mensagem_pendente = None

    def _pedir_senha(self):
        return {
            "message": (
                "Digite a senha compartilhada. A outra pessoa precisará da mesma "
                "senha para ler a mensagem. Não envie a senha junto com o código."
            ),
            "input_type": "password",
        }

    def _limpar_operacao(self):
        self.etapa = None
        self.operacao = None
        self.mensagem_pendente = None

    def responder(self, mensagem):
        mensagem = mensagem.strip()
        if not mensagem:
            return "Digite uma mensagem para continuar."

        if self.etapa == "mensagem":
            self.mensagem_pendente = mensagem
            self.etapa = "senha"
            return self._pedir_senha()

        if self.etapa == "codigo":
            self.mensagem_pendente = mensagem
            self.etapa = "senha"
            return self._pedir_senha()

        if self.etapa == "senha":
            if len(mensagem) < 8:
                return {
                    "message": "Use uma senha compartilhada com pelo menos 8 caracteres.",
                    "input_type": "password",
                }

            if self.operacao == "criptografar":
                codigo = criptografar_com_senha(self.mensagem_pendente, mensagem)
                guardar_codigo(codigo)
                self._limpar_operacao()
                return (
                    "Mensagem criptografada. Envie este código à outra pessoa e "
                    "compartilhe a senha por outro canal:\n\n" + codigo
                )

            texto = descriptografar_com_senha(self.mensagem_pendente, mensagem)
            if texto is None:
                return {
                    "message": "Senha incorreta ou código inválido. Tente novamente.",
                    "input_type": "password",
                }
            self._limpar_operacao()
            return texto

        pediu_criptografia, conteudo = extrair_intencao(
            mensagem,
            (
                "preciso mandar uma mensagem criptografada",
                "preciso de uma mensagem escondida",
                "criptografar texto",
                "criptografar",
            ),
        )
        if pediu_criptografia:
            self.operacao = "criptografar"
            if not conteudo:
                self.etapa = "mensagem"
                return "Claro! Qual mensagem você quer esconder?"
            self.mensagem_pendente = conteudo
            self.etapa = "senha"
            return self._pedir_senha()

        pediu_descriptografia, conteudo = extrair_intencao(
            mensagem,
            (
                "preciso ler uma mensagem escondida",
                "descriptografar mensagem",
                "descriptografar",
            ),
        )
        if pediu_descriptografia:
            if not conteudo:
                self.operacao = "descriptografar"
                self.etapa = "codigo"
                return "Cole aqui o código criptografado que você recebeu."

            if conteudo.startswith("HARU1:"):
                self.operacao = "descriptografar"
                self.mensagem_pendente = conteudo
                self.etapa = "senha"
                return self._pedir_senha()

            texto = descriptografar(conteudo)
            if texto is None:
                return "Esse código não é válido ou foi feito com outra chave."
            return texto

        return AJUDA


# ---------- Início ----------

def main():
    caminho_da_tela = os.path.join(pegar_pasta_da_interface(), "index.html")
    webview.create_window("Haru IA", caminho_da_tela, js_api=Api(), width=900, height=600)
    webview.start()


if __name__ == "__main__":
    main()
