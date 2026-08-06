import * as React from "react";

export type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
  title?: string;
};

const ICONS = {
  pipeline: "/preopp-icons/pipeline.png",
  propuestas: "/preopp-icons/propuestas.png",
  activas: "/preopp-icons/activas.png",
  convertidas: "/preopp-icons/convertidas.png",
  congeladas: "/preopp-icons/congeladas.png",
  descartadas: "/preopp-icons/descartadas.png",
  overview: "/preopp-icons/overview.png",
  cuentas: "/preopp-icons/cuentas.png",
  preopps: "/preopp-icons/preopps.png",
  detalle: "/preopp-icons/detalle.png",
  hubspot: "/preopp-icons/hubspot.png",
} as const;

type IconName = keyof typeof ICONS;

function IconAsset({
  name,
  size = 64,
  className = "",
  title,
}: IconProps & { name: IconName }) {
  return (
    <img
      src={ICONS[name]}
      width={size}
      height={size}
      className={`preopp-image-icon ${className}`}
      alt={title || ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
    />
  );
}

export function IconPipeline(props: IconProps) {
  return <IconAsset {...props} name="pipeline" title={props.title || "Pipeline PreOpp"} />;
}

export function IconPropuestas(props: IconProps) {
  return <IconAsset {...props} name="propuestas" title={props.title || "Propuestas"} />;
}

export function IconActivas(props: IconProps) {
  return <IconAsset {...props} name="activas" title={props.title || "Activas"} />;
}

export function IconConvertidas(props: IconProps) {
  return <IconAsset {...props} name="convertidas" title={props.title || "Convertidas"} />;
}

export function IconCongeladas(props: IconProps) {
  return <IconAsset {...props} name="congeladas" title={props.title || "Congeladas"} />;
}

export function IconDescartadas(props: IconProps) {
  return <IconAsset {...props} name="descartadas" title={props.title || "Descartadas"} />;
}

export function IconOverview(props: IconProps) {
  return <IconAsset {...props} name="overview" title={props.title || "Overview"} />;
}

export function IconCuentas(props: IconProps) {
  return <IconAsset {...props} name="cuentas" title={props.title || "Cuentas"} />;
}

export function IconPreoportunidades(props: IconProps) {
  return <IconAsset {...props} name="preopps" title={props.title || "Preoportunidades"} />;
}

export function IconDetalle(props: IconProps) {
  return <IconAsset {...props} name="detalle" title={props.title || "Ver detalles"} />;
}

export function IconHubSpot(props: IconProps) {
  return <IconAsset {...props} name="hubspot" title={props.title || "HubSpot"} />;
}