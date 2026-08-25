import { redirect } from "next/navigation";

/**
 * De batch-flow hangt aan een template: je kiest er eerst een, en schakelt dan
 * met de Eén/Meerdere-knop in de balk. Deze route bestaat alleen nog zodat een
 * gedeelde of opgeslagen link niet doodloopt.
 */
export default function BatchPickerPage() {
  redirect("/");
}
