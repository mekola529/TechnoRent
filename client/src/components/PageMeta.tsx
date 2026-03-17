import { Helmet } from "react-helmet-async";

interface PageMetaProps {
  title: string;
  description: string;
  canonical?: string;
  ogType?: string;
  noindex?: boolean;
}

export default function PageMeta({
  title,
  description,
  canonical,
  ogType = "website",
  noindex = false,
}: PageMetaProps) {
  const fullTitle = title.includes("TechnoRent") ? title : `${title} | TechnoRent`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      {canonical && <meta property="og:url" content={canonical} />}

      {/* Twitter */}
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}
