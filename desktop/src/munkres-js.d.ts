// munkres-js の型宣言（@types/munkres-js が存在しないため手動定義）
declare module 'munkres-js' {
    function munkres(matrix: number[][]): [number, number][];
    export = munkres;
}
