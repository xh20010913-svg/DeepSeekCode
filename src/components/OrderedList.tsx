import React, {
  createContext,
  isValidElement,
  useContext,
  type ReactNode,
} from "react";
import { Box } from "ink";
import { OrderedListItem, OrderedListItemContext } from "./OrderedListItem.js";

const OrderedListContext = createContext({ marker: "" });

type OrderedListComponent = ((props: {
  children: ReactNode;
}) => React.ReactElement) & {
  Item: typeof OrderedListItem;
};

export const OrderedList: OrderedListComponent = Object.assign(
  function OrderedListComponent(props: { children: ReactNode }): React.ReactElement {
    const { marker: parentMarker } = useContext(OrderedListContext);
    const itemCount = countOrderedListItems(props.children);
    const markerWidth = orderedListMarkerWidth(itemCount);
    let itemIndex = 0;

    return (
      <Box flexDirection="column">
        {React.Children.map(props.children, (child) => {
          if (!isValidElement(child) || child.type !== OrderedListItem) return child;
          itemIndex += 1;
          const marker = `${parentMarker}${formatOrderedListMarker(itemIndex, markerWidth)}`;
          return (
            <OrderedListContext.Provider value={{ marker }}>
              <OrderedListItemContext.Provider value={{ marker }}>
                {child}
              </OrderedListItemContext.Provider>
            </OrderedListContext.Provider>
          );
        })}
      </Box>
    );
  },
  { Item: OrderedListItem },
);

export function countOrderedListItems(children: ReactNode): number {
  return React.Children.toArray(children)
    .filter((child) => isValidElement(child) && child.type === OrderedListItem)
    .length;
}

export function orderedListMarkerWidth(itemCount: number): number {
  return String(Math.max(1, itemCount)).length;
}

export function formatOrderedListMarker(index: number, markerWidth: number): string {
  return `${String(Math.max(1, index)).padStart(Math.max(1, markerWidth))}.`;
}
