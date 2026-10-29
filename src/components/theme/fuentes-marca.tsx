"use client";

import React, { useEffect, useRef } from "react";
import {
  getFontCssVariables,
  validateNoDuplicateLinks,
} from "./fontes-utils";

const FONT_SHARE_URL =
  "https://api.fontshare.com/v2/css?f[]=satoshi@500,700,900&display=swap";
const GOOGLE_FONTS_QUICKSAND_URL =
  "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap";

export const FuentesMarca: React.FC = () => {
  const linkRef = useRef<HTMLLinkElement[]>([]);

  useEffect(() => {
    if (linkRef.current.length >= 3) return;
    const needed = 3 - linkRef.current.length;
    for (let i = 0; i < needed; i++) {
      const urls = [
        FONT_SHARE_URL,
        GOOGLE_FONTS_QUICKSAND_URL,
        GOOGLE_FONTS_QUICKSAND_URL,
      ];
      const url = urls[i];
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.type = "text/css";
      link.media = "all";
      document.head.appendChild(link);
      linkRef.current.push(link);
    }
  }, [linkRef.current.length]);

  useEffect(() => {
    const links = document.getElementsByTagName("link");
    const dups = validateNoDuplicateLinks(links);
    if (dups.length > 0) {
      console.warn("Duplicate font links detected:", dups);
    }
    const root = document.documentElement;
    const vars = getFontCssVariables();
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, []);
};