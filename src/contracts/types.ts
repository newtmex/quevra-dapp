import type { Abi, AbiParameter, AbiParameterToPrimitiveType, Address } from "viem";

export type ContractAbi = Abi | readonly string[];

export type GenericContract = {
  address?: Address;
  abi: ContractAbi;
};

export type GenericContractsDeclaration = Record<number, Record<string, GenericContract>>;

type WritableFunction<TAbi extends Abi> = Extract<TAbi[number], {
  type: "function";
  stateMutability: "nonpayable" | "payable";
}>;

export type ContractFunctionWriteName<TAbi extends Abi> = WritableFunction<TAbi>["name"];

export type ContractFunctionWriteArgs<
  TAbi extends Abi,
  TName extends ContractFunctionWriteName<TAbi>,
> = Extract<WritableFunction<TAbi>, { name: TName }> extends infer TFunction
  ? TFunction extends { inputs: infer TInputs extends readonly AbiParameter[] }
    ? { readonly [TIndex in keyof TInputs]: TInputs[TIndex] extends AbiParameter ? AbiParameterToPrimitiveType<TInputs[TIndex]> : never }
    : readonly []
  : never;
