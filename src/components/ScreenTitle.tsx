interface Props {
  title: string
}

export function ScreenTitle({ title }: Props) {
  return (
    <h1 className="text-2xl font-bold tracking-tight text-white px-4 pt-4 pb-2">
      {title}
    </h1>
  )
}
