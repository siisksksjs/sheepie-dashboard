import { notFound } from "next/navigation"
import { ChangelogForm } from "@/components/changelog/changelog-form"
import { getChangelogEntryById } from "@/lib/actions/changelog"

export default async function EditChangelogPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const entry = await getChangelogEntryById(id)

  if (!entry) {
    notFound()
  }

  return <ChangelogForm mode="edit" initialEntry={entry} />
}
