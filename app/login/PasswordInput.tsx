"use client";

import { useState } from "react";

export default function PasswordInput() {
  const [isVisible, setIsVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setIsVisible((currentValue) => !currentValue);
  };

  return (
    <>
      <label htmlFor="password">Contraseña</label>

      <div className="login-password-field">
        <input
          id="password"
          name="password"
          type={isVisible ? "text" : "password"}
          autoComplete="current-password"
          minLength={12}
          maxLength={256}
          required
          autoFocus
          placeholder="Ingresa la contraseña"
        />

        <button
          className="login-password-toggle"
          type="button"
          onClick={togglePasswordVisibility}
          aria-label={
            isVisible ? "Ocultar contraseña" : "Mostrar contraseña"
          }
          aria-pressed={isVisible}
          title={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {isVisible ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 3L21 21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M10.73 5.08C11.14 5.03 11.56 5 12 5C16.55 5 19.69 8.27 21 12C20.57 13.22 19.93 14.39 19.08 15.42"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.61 6.61C4.77 7.72 3.55 9.68 3 12C4.31 15.73 7.45 19 12 19C13.58 19 14.96 18.61 16.15 17.96"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.88 9.88C9.33 10.43 9 11.18 9 12C9 13.66 10.34 15 12 15C12.82 15 13.57 14.67 14.12 14.12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 12C4.31 8.27 7.45 5 12 5C16.55 5 19.69 8.27 21 12C19.69 15.73 16.55 19 12 19C7.45 19 4.31 15.73 3 12Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
