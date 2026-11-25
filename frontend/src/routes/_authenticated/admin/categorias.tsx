import { createFileRoute } from "@tanstack/solid-router";
import { seoHead } from "../../../lib/seo";
import { AdminCategoriesBrandsPage } from "./categorias-marcas";

export const Route = createFileRoute("/_authenticated/admin/categorias")({
  head: () =>
    seoHead({
      title: "Categorias — Admin Mistura Feminina",
      description: "Gerenciamento hierárquico de categorias e subcategorias.",
      path: "/admin/categorias",
      noindex: true,
    }),
  component: () => <AdminCategoriesBrandsPage initialTab="categories" />,
});
