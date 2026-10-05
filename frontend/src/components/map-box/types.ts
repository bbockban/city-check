/* Recursos que se pueden liberar (mapa, escena, workers). */
export interface Disposable {
  dispose: () => Promise<void>;
}
