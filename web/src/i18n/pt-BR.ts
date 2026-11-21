import type { Catalogue } from './en';

/**
 * Português (Brasil). Written by the project's maintainer — the catalogue the
 * other translations should look like.
 *
 * Tone follows the English: plain and direct, no exclamation marks, and the same
 * words the RustDesk UI uses (ID, senha, servidor, relay). Placeholders such as
 * `{count}` keep their names.
 */
export const ptBR: Catalogue = {
  'connect.subtitle': 'Cliente web do RustDesk',
  'connect.formLabel': 'Conectar a uma máquina RustDesk',
  'connect.deviceId': 'ID do dispositivo',
  'connect.deviceIdPlaceholder': 'Digite o ID do RustDesk',
  'connect.password': 'Senha',
  'connect.passwordPlaceholder': 'Senha de conexão',
  'connect.rememberPassword': 'Lembrar senha',
  'connect.rememberPasswordHint':
    'Salva a senha no armazenamento local deste navegador. Deixe desmarcado em computadores compartilhados.',
  'connect.advanced': 'Opções avançadas',
  'connect.advancedHint':
    'Substitui os padrões do servidor. Deixe em branco para usar o servidor configurado no gateway.',
  'connect.hbbs': 'Host HBBS (rendezvous)',
  'connect.hbbsPlaceholder': 'ex.: myserver.com:21118',
  'connect.hbbr': 'Host HBBR (relay)',
  'connect.hbbrPlaceholder': 'ex.: myserver.com:21119',
  'connect.serverKey': 'Chave do servidor',
  'connect.serverKeyPlaceholder': 'chave pública em base64',
  'connect.showDebug': 'Mostrar informações de depuração',
  'connect.connect': 'Conectar',
  'connect.connecting': 'Conectando…',
  'connect.connected': 'Conectado',
  'connect.disconnected': 'Desconectado',

  'toolbar.label': 'Controles da sessão',
  'toolbar.fit': 'Ajustar',
  'toolbar.native': '1:1',
  'toolbar.fitTitleOn': 'Mudar para 1:1 (resolução nativa)',
  'toolbar.fitTitleOff': 'Mudar para Ajustar (escalar à janela)',
  'toolbar.fitAriaOn': 'Ajustar à janela, ativado',
  'toolbar.fitAriaOff': 'Ajustar à janela, desativado',
  'toolbar.fullscreen': 'Tela cheia',
  'toolbar.enterFullscreen': 'Entrar em tela cheia',
  'toolbar.disconnect': 'Desconectar',

  'theme.label': 'Tema de cores',
  'theme.system': 'Sistema',
  'theme.light': 'Claro',
  'theme.dark': 'Escuro',
  'language.label': 'Idioma',

  'debug.show': 'Logs de depuração',
  'debug.hide': 'Ocultar logs',
  'debug.copy': 'Copiar tudo',
  'debug.copied': 'Copiado!',
  'debug.entries': '{count} entradas',

  'stats.gwFps': 'FPS do gateway',
  'stats.fps': 'FPS',
  'stats.frameDelta': 'Intervalo',
  'stats.decode': 'Decodificação',
  'stats.ping': 'Latência',
  'stats.lastFrame': 'Último quadro',
  'stats.msAgo': 'há {value}ms',
  'stats.noValue': '—',

  'error.wrongPassword.title': 'Senha incorreta',
  'error.wrongPassword.hint': 'Confira a senha no RustDesk da máquina remota e tente de novo.',
  'error.captcha.title': 'Falha na verificação do captcha',
  'error.captcha.hint': 'Resolva o captcha novamente e tente outra vez.',
  'error.offline.title': 'Essa máquina está offline',
  'error.offline.hint': 'Verifique se o RustDesk está aberto na máquina remota e conectado ao seu relay.',
  'error.relayTimeout.title': 'O relay não respondeu',
  'error.relayTimeout.hint':
    'Verifique se o servidor de relay está no ar e se o endereço nas opções avançadas está correto.',
  'error.relayUnreachable.title': 'Não foi possível alcançar o relay',
  'error.relayUnreachable.hint':
    'Verifique o host e a porta do relay, e se ele aceita conexões WebSocket.',
  'error.hostClosed.title': 'A máquina remota encerrou a sessão',
  'error.hostClosed.hint': 'Ela pode ter sido bloqueada, desconectada, ou alguém encerrou a sessão por lá.',
  'error.gateway.title': 'Não foi possível alcançar o gateway do rclient',
  'error.gateway.hint': 'O gateway pode estar fora do ar. Recarregue a página e tente de novo.',
  'error.handshake.title': 'Falha no handshake de criptografia',
  'error.handshake.hint': 'Reconecte. Se continuar acontecendo, a chave do servidor pode estar errada.',
  'error.generic.title': 'Falha na conexão',
  'error.generic.hint':
    'O painel de depuração tem os detalhes técnicos. Verifique o ID da máquina, a senha e as configurações de relay.',
};
