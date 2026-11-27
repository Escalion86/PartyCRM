export default function PartyOrderServiceDetails({ item }) {
  const details = item?.serviceConfiguration?.details
  if (!details?.length) return null

  return (
    <ul className="mt-1 space-y-0.5 text-xs text-slate-600 [overflow-wrap:anywhere]">
      {details.map((detail, index) => (
        <li key={`${index}:${detail}`}>{detail}</li>
      ))}
    </ul>
  )
}
