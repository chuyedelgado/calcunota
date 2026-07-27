import type {Config} from "tailwindcss";

const config: Config = {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			screens: {
				xs: "475px",
			},
			colors: {
				// Acento CIRUELA. REGLA: solo para lo interactivo (botones, estado
				// seleccionado, enlaces). Nunca para datos protagonistas ni decorativo.
				// NO subir su saturación: lo que la separa del rojo semántico es la
				// saturación (~26% vs ~72%), no el tono. Ver memory/diseno-tokens-ciruela.
				primary: {
					"100": "#F1E7EC", // tinte suave (fondos, hover, meta sugerida)
					ink: "#5E3049", // ciruela oscura para TEXTO sobre papel (AA holgado)
					DEFAULT: "#834D6B",
				},
				secondary: "#FBE843",
				// Neutros cálidos: papel de fondo, tinta casi-negra (también para los
				// números protagonistas: son datos, van en casi-negro, no en ciruela).
				crema: "#F4F1EB",
				tinta: "#2A241F",
				// Hairline muy tenue: respaldo de la sombra para separar tarjetas.
				hairline: "#E7E1D7",
				// Color con intención semántica, consistente en toda la app:
				// verde = asegurado/aprobado, ámbar = exigente/atención, rojo =
				// reprobado/bloqueo. Tono "suave" para fondos, "fuerte" para texto
				// y bordes (contraste AA sobre el suave).
				verde: { suave: "#E4F0E8", fuerte: "#1F6B47" },
				ambar: { suave: "#F6EBD3", fuerte: "#9A6413" },
				rojo: { suave: "#F6E2DE", fuerte: "#B0463A" },
				black: {
					"100": "#333333",
					"200": "#141413",
					"300": "#776E63", // gris cálido (texto secundario)
					DEFAULT: "#000000",
				},
				white: {
					"100": "#F7F7F7",
					DEFAULT: "#FFFFFF",
				},
			},
			fontFamily: {
				"work-sans": ["var(--font-work-sans)"],
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			boxShadow: {
				100: "2px 2px 0px 0px rgb(0, 0, 0)",
				200: "2px 2px 0px 2px rgb(0, 0, 0)",
				300: "2px 2px 0px 2px rgb(238, 43, 105)",
				// Sombras suaves para profundidad (en vez de solo bordes duros).
				suave: "0 6px 20px -8px rgba(33,28,26,0.18), 0 2px 6px -3px rgba(33,28,26,0.10)",
				hero: "0 14px 34px -12px rgba(131,77,107,0.30), 0 3px 10px -4px rgba(42,36,31,0.12)",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};

export default config;