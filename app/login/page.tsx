import type { Metadata } from "next";
import { sanitizeReturnPath } from "../../lib/auth";
import PasswordInput from "./PasswordInput";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PreOpp Radar | Monitoreo Comercial",
  description: "Dashboard semanal de pre-oportunidades comerciales",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

type LoginPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readSearchParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({ searchParams = {} }: LoginPageProps) {
  const nextPath = sanitizeReturnPath(readSearchParam(searchParams.next));
  const hasError = readSearchParam(searchParams.error) === "1";
  const hasConfigurationError =
    readSearchParam(searchParams.config) === "1";
  const hasLoggedOut = readSearchParam(searchParams.logout) === "1";

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-brand-mark" aria-hidden="true">
            ◎
          </div>
          <div>
            <strong>PreOpp Radar</strong>
            <span>Monitoreo comercial privado</span>
          </div>
        </div>

        <div className="login-copy">
          <span className="login-eyebrow">Acceso restringido</span>
          <h1 id="login-title">Ingresa al dashboard</h1>
          <p>
            Escribe la contraseña autorizada para consultar la información de
            pre-oportunidades.
          </p>
        </div>

        {hasError && (
          <div className="login-message login-message-error" role="alert">
            La contraseña no es correcta. Verifícala e intenta nuevamente.
          </div>
        )}

        {hasConfigurationError && (
          <div className="login-message login-message-error" role="alert">
            La protección todavía no está configurada en este entorno. Revisa
            las variables privadas del proyecto.
          </div>
        )}

        {hasLoggedOut && (
          <div className="login-message login-message-success" role="status">
            La sesión se cerró correctamente.
          </div>
        )}

        <form className="login-form" action="/api/login" method="post">
          <input type="hidden" name="next" value={nextPath} />

          <PasswordInput />

          <button className="login-submit-button" type="submit">
            Ingresar de forma segura
          </button>
        </form>

        <div className="login-security-note">
          <strong>Sesión protegida</strong>
          <span>
            El acceso caduca automáticamente después de 8 horas y puede
            cerrarse desde el dashboard.
          </span>
        </div>
      </section>
    </main>
  );
}
