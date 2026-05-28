import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  RotateCcw,
  Monitor,
  Trophy,
  CalendarDays,
  Clock3,
  FileUp,
  Users,
  AlertTriangle,
  Search,
  Columns2,
  Columns3,
  Medal,
  ChevronDown,
  Star,
  MessageSquareHeart,
} from "lucide-react";

const statusStyles = {
  G6: "bg-emerald-200 text-emerald-900 border-emerald-300",
  Z4: "bg-rose-200 text-rose-900 border-rose-300",
  MEIO: "bg-slate-200 text-slate-800 border-slate-300",
};

const STORAGE_KEY = "brasileirao-atendimento:importacao:v1";
const DEMO_FILE_NAME = "Exemplo demonstrativo";
const INITIAL_VIEWPORT = { width: 1280, height: 720 };

const excludedNames = [
  "LANA MEDEIROS",
  "RENATA ROMÃO",
  "SARA DIAS",
  "HAMILTON MACHADO",
  "MURILO LIMA",
  "ALICE DANTAS",
  "BRUNO LEMOS",
  "LUIS FACHIM",
  "JOAO PEDRO ANGELINO",
  "JOÃO PEDRO ANGELINO",
  "HEITOR BEGA",
  "HEITOR DRAGO GOIS",
  "JUAN DELFINO",
  "PEDRO SOUSA",
  "THAINA GOUVEA",
  "THAINÁ GOUVEA",
  "VITÓRIA GARCIA",
  "VITORIA GARCIA",
  "YASMIN DOMINGUES",
  "EDUARDO THOMAZ",
  "PAULO FREITAS",
];

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function isExcludedName(name) {
  const normalizedName = normalizeKey(name);
  return excludedNames.some((excluded) => normalizeKey(excluded) === normalizedName);
}

function findField(row, candidates) {
  const entries = Object.entries(row || {});
  const normalizedCandidates = candidates.map(normalizeKey);
  const found = entries.find(([key]) => normalizedCandidates.includes(normalizeKey(key)));
  return found ? found[1] : "";
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value || "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value) {
  const number = Number(value || 0);
  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  const number = Number(value || 0);
  return (
    number.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }) + "%"
  );
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

const dateFieldCandidates = [
  "DataAvaliacao",
  "data avaliacao",
  "data de avaliacao",
  "data",
  "dt avaliacao",
  "dt_avaliacao",
];

function getDateValue(row) {
  return findField(row, dateFieldCandidates);
}

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const onlyDate = raw.split(/[ T]/)[0];

  const brMatch = onlyDate.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, "0");
    const month = brMatch[2].padStart(2, "0");
    const year = brMatch[3].length === 2 ? "20" + brMatch[3] : brMatch[3];
    return year + "-" + month + "-" + day;
  }

  const isoMatch = onlyDate.match(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  return onlyDate;
}

function getLatestDateKey(rows) {
  return rows.reduce((latest, row) => {
    const key = normalizeDateKey(getDateValue(row));
    if (!key) return latest;
    return !latest || key > latest ? key : latest;
  }, "");
}

function getLatestDayRows(rows) {
  const latestDateKey = getLatestDateKey(rows);
  if (!latestDateKey) return rows;
  return rows.filter((row) => normalizeDateKey(getDateValue(row)) === latestDateKey);
}

function formatDateKey(dateKey) {
  const match = String(dateKey || "").match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (!match) return dateKey || formatDate();
  return `${match[3]}/${match[2]}/${match[1].slice(-2)}`;
}

function countUniqueDays(rows) {
  const days = new Set();

  rows.forEach((row) => {
    const key = normalizeDateKey(getDateValue(row));
    if (key) days.add(key);
  });

  return days.size || 1;
}

function splitCsvLine(line, separator = ",") {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < String(line || "").length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === separator && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((item) => item.trim().replace(/^"|"$/g, ""));
}

function csvTextToObjects(text) {
  const cleanText = String(text || "").replace(String.fromCharCode(65279), "");
  const lines = cleanText
    .split(String.fromCharCode(10))
    .map((line) => line.replace(String.fromCharCode(13), ""))
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) return [];

  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], separator);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, separator);
    return headers.reduce((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
}

function getMedal(position) {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

function getStatus(position, total) {
  if (position <= 6) return "G6";
  if (position > Math.max(total - 4, 0)) return "Z4";
  return "MEIO";
}

const demoData = [
  {
    nomeApresentativo: "LEONARDO TOFOLETTI",
    NotaServico: 5,
    NotaProduto: 5,
    NotaEmpresa: 5,
    Resolve: "Sim",
    comentario: "Excelente atendimento, muito atencioso.",
    DataAvaliacao: "01/05/2026",
  },
  {
    nomeApresentativo: "GABRIEL FRATOCELI",
    NotaServico: 5,
    NotaProduto: 5,
    NotaEmpresa: 5,
    Resolve: "Sim",
    comentario: "Atendimento ótimo e muito rápido.",
    DataAvaliacao: "02/05/2026",
  },
  {
    nomeApresentativo: "DIEGO MARTINS",
    NotaServico: 5,
    NotaProduto: 5,
    NotaEmpresa: 5,
    Resolve: "Sim",
    comentario: "Parabéns pelo suporte, perfeito.",
    DataAvaliacao: "03/05/2026",
  },
  {
    nomeApresentativo: "LANA MEDEIROS",
    NotaServico: 5,
    NotaProduto: 5,
    NotaEmpresa: 5,
    Resolve: "Sim",
    comentario: "Muito bom, fiquei satisfeita.",
    DataAvaliacao: "04/05/2026",
  },
];

function mapRows(rows) {
  const mapped = rows
    .map((row) => {
      const nome = findField(row, [
        "nomeApresentativo",
        "nome_apresentativo",
        "nome apresentativo",
        "tecnico",
        "técnico",
        "nome",
        "colaborador",
      ]);

      const notaServico = findField(row, [
        "NotaServico",
        "notaServico",
        "nota servico",
        "nota serviço",
        "media",
        "média",
        "nota",
        "pontuacao",
        "pontuação",
      ]);

      const resolve = findField(row, ["Resolve", "resolvido", "solucionado"]);

      return {
        nomeApresentativo: String(nome || "").trim().toUpperCase(),
        notaServico: parseNumber(notaServico),
        resolve: String(resolve || "").trim().toLowerCase(),
      };
    })
    .filter(
      (item) =>
        item.nomeApresentativo &&
        item.notaServico > 0 &&
        !isExcludedName(item.nomeApresentativo)
    );

  const grouped = new Map();

  mapped.forEach((item) => {
    const current = grouped.get(item.nomeApresentativo) || {
      nomeApresentativo: item.nomeApresentativo,
      qtd: 0,
      pontos: 0,
      resolvidos: 0,
    };

    current.qtd += 1;
    current.pontos += item.notaServico;
    current.resolvidos += item.resolve === "sim" ? 1 : 0;
    grouped.set(item.nomeApresentativo, current);
  });

  return Array.from(grouped.values())
    .map((item) => ({
      ...item,
      mediaServico: item.qtd ? item.pontos / item.qtd : 0,
      resolvePercent: item.qtd ? (item.resolvidos / item.qtd) * 100 : 0,
    }))
    .sort(
      (a, b) =>
        b.qtd - a.qtd ||
        b.mediaServico - a.mediaServico ||
        a.nomeApresentativo.localeCompare(b.nomeApresentativo)
    )
    .map((item, index, array) => ({
      ...item,
      posicao: index + 1,
      status: getStatus(index + 1, array.length),
    }));
}

function loadSavedImport() {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed?.rows) || !mapRows(parsed.rows).length) return null;

    return {
      rows: parsed.rows,
      fileName: parsed.fileName || "CSV importado",
    };
  } catch {
    return null;
  }
}

function saveImport(rows, fileName) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      rows,
      fileName,
      savedAt: new Date().toISOString(),
    })
  );
}

function clearSavedImport() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function getInitialDashboardState() {
  const savedImport = loadSavedImport();
  const rows = savedImport?.rows || demoData;

  return {
    rows,
    fileName: savedImport?.fileName || DEMO_FILE_NAME,
    round: countUniqueDays(rows),
  };
}

function getViewportSize() {
  if (typeof window === "undefined") return INITIAL_VIEWPORT;

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function useViewportSize() {
  const [viewport, setViewport] = useState(() => getViewportSize());

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function handleResize() {
      setViewport(getViewportSize());
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewport;
}

function isElogio(comment) {
  const text = String(comment || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (text.trim().length < 8) return false;

  return [
    "excelente",
    "otimo",
    "otima",
    "parabens",
    "muito bom",
    "muito boa",
    "bem atendido",
    "bem atendida",
    "atencioso",
    "atenciosa",
    "rapido",
    "rapida",
    "eficiente",
    "perfeito",
    "perfeita",
    "satisfeito",
    "satisfeita",
    "gostei",
    "show",
    "top",
  ].some((word) => text.includes(word));
}

function calculateStats(rows) {
  const stats = {
    notaServicoTotal: 0,
    notaServicoQuantidade: 0,
    notaProdutoTotal: 0,
    notaProdutoQuantidade: 0,
    notaEmpresaTotal: 0,
    notaEmpresaQuantidade: 0,
    comentariosElogios: [],
  };

  rows.forEach((row) => {
    const nome = String(
      findField(row, ["nomeApresentativo", "nome apresentativo", "tecnico", "técnico", "nome"]) || ""
    )
      .trim()
      .toUpperCase();

    if (isExcludedName(nome)) return;

    const notaServico = parseNumber(
      findField(row, ["NotaServico", "notaServico", "nota servico", "nota serviço"])
    );
    const notaProduto = parseNumber(
      findField(row, ["NotaProduto", "notaProduto", "nota produto"])
    );
    const notaEmpresa = parseNumber(
      findField(row, ["NotaEmpresa", "notaEmpresa", "nota empresa"])
    );
    const comentario = String(
      findField(row, ["comentario", "comentário", "observacao", "observação", "feedback"]) || ""
    ).trim();

    if (notaServico > 0) {
      stats.notaServicoTotal += notaServico;
      stats.notaServicoQuantidade += 1;
    }

    if (notaProduto > 0) {
      stats.notaProdutoTotal += notaProduto;
      stats.notaProdutoQuantidade += 1;
    }

    if (notaEmpresa > 0) {
      stats.notaEmpresaTotal += notaEmpresa;
      stats.notaEmpresaQuantidade += 1;
    }

    if (isElogio(comentario) && stats.comentariosElogios.length < 10) {
      stats.comentariosElogios.push({ nome: nome || "Cliente", comentario });
    }
  });

  return {
    ...stats,
    mediaNotaServico: stats.notaServicoQuantidade
      ? stats.notaServicoTotal / stats.notaServicoQuantidade
      : 0,
    mediaNotaProduto: stats.notaProdutoQuantidade
      ? stats.notaProdutoTotal / stats.notaProdutoQuantidade
      : 0,
    mediaNotaEmpresa: stats.notaEmpresaQuantidade
      ? stats.notaEmpresaTotal / stats.notaEmpresaQuantidade
      : 0,
  };
}

function HeaderButton({ icon: Icon, children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`header-button flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black shadow-sm transition hover:-translate-y-0.5 ${
        active ? "bg-lime-400 text-slate-950" : "bg-slate-200/95 text-slate-900 hover:bg-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="info-card rounded-xl border border-slate-300/70 bg-gradient-to-b from-slate-100 to-slate-200 px-3 py-2 shadow-inner">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="truncate text-xs font-black text-slate-950">{value}</div>
    </div>
  );
}

function ExcellencePanel({ stats }) {
  const totalGeral = Math.max(
    stats.notaServicoQuantidade || 0,
    stats.notaProdutoQuantidade || 0,
    stats.notaEmpresaQuantidade || 0
  );

  const cards = [
    { label: "Média Nota Serviço", media: stats.mediaNotaServico },
    { label: "Média Nota Produto", media: stats.mediaNotaProduto },
    { label: "Média Nota Empresa", media: stats.mediaNotaEmpresa },
  ];

  return (
    <section className="dashboard-excellence grid grid-cols-1 gap-2 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="excellence-card rounded-xl border border-amber-200 bg-white/95 p-2 shadow-sm">
        <div className="excellence-summary mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
            <Star className="h-4 w-4 text-amber-500" /> Médias gerais das avaliações
          </div>
          <div className="total-card rounded-lg bg-slate-950 px-3 py-1.5 text-right text-white shadow-sm">
            <div className="text-xl font-black leading-none">{totalGeral}</div>
            <div className="text-[9px] font-black uppercase tracking-wide text-slate-300">
              total de avaliações
            </div>
          </div>
        </div>

        <div className="score-grid grid grid-cols-3 gap-2">
          {cards.map((card) => (
            <div
              key={card.label}
              className="score-card rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white px-3 py-2 shadow-sm"
            >
              <div className="score-label flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                <Star className="h-3.5 w-3.5" /> {card.label}
              </div>
              <div className="score-value text-3xl font-black leading-none text-slate-950">{formatScore(card.media)}</div>
              <div className="text-[10px] font-bold leading-tight text-slate-500">média geral</div>
            </div>
          ))}
        </div>
      </div>

      <div className="comments-card rounded-xl border border-sky-100 bg-white/95 p-2 shadow-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
          <MessageSquareHeart className="h-4 w-4 text-rose-500" /> 10 comentários com elogios
        </div>
        {stats.comentariosElogios.length ? (
          <div className="comment-grid grid grid-cols-2 gap-1 xl:grid-cols-5">
            {stats.comentariosElogios.map((item, index) => (
              <div
                key={`${item.nome}-${index}`}
                className="comment-card rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold leading-tight text-slate-700 ring-1 ring-slate-200"
              >
                <div className="truncate text-[10px] font-black uppercase text-slate-950">
                  {index + 1}. {item.nome}
                </div>
                <div className="line-clamp-2">“{item.comentario}”</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="comment-empty rounded-lg bg-slate-50 px-3 py-5 text-center text-xs font-bold text-slate-500">
            Importe o CSV para listar elogios encontrados nos comentários.
          </div>
        )}
      </div>
    </section>
  );
}

function HighlightCard({ title, items, type }) {
  return (
    <div
      className={`highlight-card rounded-xl border bg-white/95 p-2 shadow-sm ${
        type === "risk" ? "border-rose-200" : "border-emerald-200"
      }`}
    >
      <div className="highlight-title mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-950">
        <span
          className={`h-6 w-1.5 rounded-full ${
            type === "risk" ? "bg-rose-500" : "bg-emerald-400"
          }`}
        />
        {title}
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={`${title}-${item.posicao}`}
            className="highlight-row grid grid-cols-[34px_1fr_46px] items-center rounded-lg bg-slate-50 px-2 py-1 text-xs font-black"
          >
            <span>{item.posicao}º</span>
            <span className="truncate">{item.nomeApresentativo}</span>
            <span className="text-right text-sm">{formatScore(item.mediaServico)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const Icon = status === "Z4" ? AlertTriangle : status === "G6" ? Trophy : Users;

  return (
    <span
      className={`status-pill inline-flex min-w-[56px] items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${statusStyles[status]}`}
    >
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

function RankingTable({ data, title, twoColumns, filterStatus, search, viewport }) {
  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchStatus = filterStatus === "TODOS" || item.status === filterStatus;
      const matchSearch =
        !search || item.nomeApresentativo.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [data, filterStatus, search]);

  const availableWidth = viewport?.width || INITIAL_VIEWPORT.width;
  const landscape = availableWidth >= (viewport?.height || INITIAL_VIEWPORT.height);
  const maxAutoColumns =
    !twoColumns || availableWidth < 760
      ? 1
      : availableWidth < 1100
      ? 2
      : availableWidth < 1500
      ? 3
      : 4;
  const columnCount = twoColumns && landscape
    ? Math.min(
        maxAutoColumns,
        filtered.length > 36 ? 4 : filtered.length > 22 ? 3 : filtered.length > 8 ? 2 : 1
      )
    : 1;
  const itemsPerColumn = Math.ceil(filtered.length / columnCount) || 1;
  const columnChunks = Array.from({ length: columnCount }, (_, index) =>
    filtered.slice(index * itemsPerColumn, (index + 1) * itemsPerColumn)
  );
  const columns = filtered.length ? columnChunks.filter((chunk) => chunk.length) : [[]];
  const maxRowsPerColumn = Math.max(...columns.map((chunk) => chunk.length), 1);
  const compactColumns = columns.length >= 3 || availableWidth < 760;
  const tableColumnsClass = compactColumns
    ? "grid-cols-[40px_1fr_42px_50px_56px]"
    : "grid-cols-[52px_1fr_56px_62px_70px_76px]";

  return (
    <section
      className="ranking-panel flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
      style={{ "--ranking-rows": maxRowsPerColumn, "--ranking-columns": columns.length }}
    >
      <div className="ranking-panel-header flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-white to-sky-50 px-3 py-2">
        <h2 className="ranking-title truncate text-lg font-black tracking-tight text-slate-950">{title}</h2>
        <div className="ranking-legend flex shrink-0 items-center gap-1.5 text-[10px] font-black">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">G6</span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">Z4</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">↕ Movimento</span>
        </div>
      </div>

      <div
        className="ranking-grid grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((chunk, chunkIndex) => (
          <div
            key={chunkIndex}
            className={`ranking-column flex min-h-0 flex-col ${
              chunkIndex > 0 ? "border-l border-slate-200" : ""
            }`}
          >
            <div className={`ranking-column-head grid ${tableColumnsClass} shrink-0 gap-1 bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500`}>
              <span>Pos.</span>
              <span>Técnico</span>
              <span>Aval.</span>
              <span>Média</span>
              {!compactColumns && <span>Resolve</span>}
              <span>Status</span>
            </div>
            <div className="ranking-list min-h-0 flex-1">
              <AnimatePresence initial={false}>
              {chunk.map((item) => (
                <motion.div
                  key={item.nomeApresentativo}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className={`ranking-row grid ${tableColumnsClass} min-h-0 items-center gap-1 overflow-hidden border-b border-slate-200 px-2 py-1 text-xs font-black ${
                    item.status === "G6"
                      ? "bg-emerald-50"
                      : item.status === "Z4"
                      ? "bg-rose-50"
                      : "bg-white"
                  }`}
                >
                  <span>
                    {item.posicao}º <span>{getMedal(item.posicao)}</span>
                  </span>
                  <span className="truncate">{item.nomeApresentativo}</span>
                  <span>{item.qtd}</span>
                  <span>{formatScore(item.mediaServico)}</span>
                  {!compactColumns && <span className="text-[10px] text-slate-600">{formatPercent(item.resolvePercent)}</span>}
                  <StatusPill status={item.status} />
                </motion.div>
              ))}
              </AnimatePresence>
              {!chunk.length && (
                <div className="ranking-empty flex items-center justify-center px-4 text-sm font-black text-slate-400">
                  Sem dados para esta classificação.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const fileInputRef = useRef(null);
  const viewport = useViewportSize();
  const [initialDashboardState] = useState(() => getInitialDashboardState());
  const [rawRows, setRawRows] = useState(initialDashboardState.rows);
  const [fileName, setFileName] = useState(initialDashboardState.fileName);
  const [activeTab, setActiveTab] = useState("dia");
  const [twoColumns, setTwoColumns] = useState(true);
  const [presentation, setPresentation] = useState(false);
  const [filterStatus, setFilterStatus] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [round, setRound] = useState(initialDashboardState.round);

  const latestDayRows = useMemo(() => getLatestDayRows(rawRows), [rawRows]);
  const dayRanking = useMemo(() => mapRows(latestDayRows), [latestDayRows]);
  const generalRanking = useMemo(() => mapRows(rawRows), [rawRows]);
  const stats = useMemo(() => calculateStats(rawRows), [rawRows]);
  const latestDayLabel = formatDateKey(getLatestDateKey(rawRows));
  const currentRanking = activeTab === "dia" ? dayRanking : generalRanking;

  const leaderDay = dayRanking[0];
  const leaderGeneral = generalRanking[0];
  const g6 = currentRanking.slice(0, 6);
  const z4 = currentRanking.slice(-4);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveTab((current) => (current === "dia" ? "geral" : "dia"));
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv") {
      alert("Envie um arquivo CSV UTF-8.");
      return;
    }

    const text = await file.text();
    const jsonRows = csvTextToObjects(text);
    const ranked = mapRows(jsonRows);

    if (!ranked.length) {
      alert(
        "Não encontrei dados válidos no CSV. Confira se o arquivo possui as colunas nomeApresentativo e NotaServico."
      );
      return;
    }

    try {
      saveImport(jsonRows, file.name);
      setRawRows(jsonRows);
      setFileName(file.name);
      setRound(countUniqueDays(jsonRows));
      event.target.value = "";
    } catch {
      alert("Não consegui salvar os dados no navegador. Tente importar um arquivo menor.");
    }
  }

  function resetDemo() {
    clearSavedImport();
    setRawRows(demoData);
    setFileName(DEMO_FILE_NAME);
    setRound(countUniqueDays(demoData));
    setSearch("");
    setFilterStatus("TODOS");
  }

  return (
    <main className={`dashboard-root h-screen overflow-hidden bg-slate-950 p-2 text-slate-950 ${presentation ? "cursor-none" : ""}`}>
      <div className="dashboard-shell mx-auto flex h-full max-w-[1800px] flex-col gap-2">
        <header className="dashboard-header shrink-0 rounded-2xl border border-sky-400/20 bg-gradient-to-r from-sky-950 via-slate-900 to-slate-950 p-3 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="dashboard-eyebrow flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-200/80">
                <Trophy className="h-4 w-4" /> TV Ranking • Estilo transmissão
              </div>
              <h1 className="dashboard-title mt-0.5 truncate text-3xl font-black leading-none tracking-tight md:text-4xl">
                Brasileirão do Atendimento
              </h1>
            </div>

            <div className="dashboard-actions flex shrink-0 flex-wrap items-center justify-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFile}
              />
              <HeaderButton icon={Upload} onClick={() => fileInputRef.current?.click()}>
                Importar CSV
              </HeaderButton>
              <HeaderButton icon={RotateCcw} onClick={resetDemo}>
                Reiniciar
              </HeaderButton>
              <HeaderButton
                icon={Monitor}
                active={presentation}
                onClick={() => setPresentation(!presentation)}
              >
                Modo apresentação
              </HeaderButton>
              <HeaderButton
                icon={twoColumns ? Columns2 : Columns3}
                onClick={() => setTwoColumns(!twoColumns)}
              >
                {twoColumns ? "Colunas auto" : "1 coluna"}
              </HeaderButton>
            </div>
          </div>
        </header>

        <section className="dashboard-info grid shrink-0 grid-cols-5 gap-2">
          <InfoCard icon={CalendarDays} label="Data do dia" value={latestDayLabel} />
          <InfoCard icon={Clock3} label="Rodadas" value={round} />
          <InfoCard icon={Medal} label="Líder do dia" value={leaderDay?.nomeApresentativo || "Sem dados"} />
          <InfoCard icon={Trophy} label="Líder geral" value={leaderGeneral?.nomeApresentativo || "Sem dados"} />
          <InfoCard icon={FileUp} label="Arquivo" value={fileName} />
        </section>

        <ExcellencePanel stats={stats} />

        <section className="dashboard-highlights grid shrink-0 grid-cols-2 gap-2">
          <HighlightCard title="G6 em destaque" items={g6} type="g6" />
          <HighlightCard title="Z4 Zona de Risco" items={z4} type="risk" />
        </section>

        <section className="dashboard-controls flex shrink-0 items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("dia")}
              className={`control-button rounded-full px-3 py-1.5 text-xs font-black shadow ${
                activeTab === "dia" ? "bg-amber-100 text-slate-950" : "bg-slate-800 text-slate-200"
              }`}
            >
              Classificação do dia
            </button>
            <button
              onClick={() => setActiveTab("geral")}
              className={`control-button rounded-full px-3 py-1.5 text-xs font-black shadow ${
                activeTab === "geral" ? "bg-amber-100 text-slate-950" : "bg-slate-800 text-slate-200"
              }`}
            >
              Classificação geral
            </button>
          </div>

          <div className="control-panel flex items-center gap-2 rounded-xl bg-slate-900 p-1.5 text-white shadow-inner">
            <div className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-slate-900">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar técnico"
                className="w-36 bg-transparent text-xs font-bold outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="appearance-none rounded-lg bg-white px-2 py-1.5 pr-7 text-xs font-black text-slate-900 outline-none"
              >
                <option value="TODOS">Todos</option>
                <option value="G6">G6</option>
                <option value="MEIO">Meio</option>
                <option value="Z4">Z4</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-slate-500" />
            </div>
          </div>
        </section>

        <div className="dashboard-table-wrap min-h-0 flex-1">
          <RankingTable
            data={currentRanking}
            title={activeTab === "dia" ? `Classificação do dia - ${latestDayLabel}` : "Classificação geral"}
            twoColumns={twoColumns}
            filterStatus={filterStatus}
            search={search}
            viewport={viewport}
          />
        </div>

        <footer className="dashboard-footer shrink-0 truncate text-center text-[10px] font-bold leading-none text-slate-500">
          Para importar, envie um arquivo <span className="text-slate-300">CSV UTF-8</span> com as colunas <span className="text-slate-300">nomeApresentativo</span> e <span className="text-slate-300">NotaServico</span>. O ranking remove automaticamente os nomes fora do setor, ordena pela maior quantidade de avaliações do técnico e, em caso de empate, usa a maior média de Nota Serviço.
        </footer>
      </div>
    </main>
  );
}
