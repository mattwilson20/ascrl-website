"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
export type Column = {
  key: string;
  label: string;
  href?: string;
  idKey?: string;
};
export function DataTable({
  rows,
  columns,
  searchLabel = "Search records",
}: {
  rows: Record<string, unknown>[];
  columns: Column[];
  searchLabel?: string;
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState(""),
    [desc, setDesc] = useState(false);
  const data = useMemo(() => {
    const filtered = rows.filter((r) =>
      columns.some((c) =>
        String(r[c.key] ?? "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    );
    if (sort)
      filtered.sort((a, b) => {
        const x = a[sort],
          y = b[sort];
        const result =
          x !== null &&
          y !== null &&
          x !== "" &&
          y !== "" &&
          Number.isFinite(Number(x)) &&
          Number.isFinite(Number(y))
            ? Number(x) - Number(y)
            : String(x ?? "").localeCompare(String(y ?? ""));
        return desc ? -result : result;
      });
    return filtered;
  }, [rows, columns, search, sort, desc]);
  return (
    <div className="table-panel">
      <div className="table-tools">
        <label className="search">
          <span className="sr-only">{searchLabel}</span>
          <input
            type="search"
            placeholder={searchLabel}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <span>{data.length} records</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    sort === c.key
                      ? desc
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setSort(c.key);
                      setDesc(sort === c.key ? !desc : false);
                    }}
                  >
                    {c.label}
                    {sort === c.key ? (desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr
                key={
                  String(r.id ?? r.driver_id ?? r.team_id ?? "row") + "-" + i
                }
              >
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.href && r[c.idKey || "id"] ? (
                      <Link href={c.href + String(r[c.idKey || "id"])}>
                        {String(r[c.key] ?? "—")}
                      </Link>
                    ) : typeof r[c.key] === "boolean" ? (
                      r[c.key] ? (
                        "Yes"
                      ) : (
                        "No"
                      )
                    ) : r[c.key] === null || r[c.key] === undefined ? (
                      "—"
                    ) : (
                      String(r[c.key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && (
          <div className="empty compact">No matching records.</div>
        )}
      </div>
    </div>
  );
}
